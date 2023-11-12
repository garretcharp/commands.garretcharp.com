import { Hono } from 'hono/quick'
import { array, object, string } from 'zod'
import { createDate, TimeSpan } from 'oslo'
import { encodeBase64 } from 'oslo/encoding'
import { safe } from '../utils'
import { generateIdToken, getTwitchAppToken, getTwitchToken, parseIdToken } from '../utils/twitch'

const EVENTS = ['user.update', 'stream.online', 'stream.offline']

export default class AuthTokens implements DurableObject {
	private app = new Hono<{ Bindings: Bindings }>()

	constructor(private state: DurableObjectState, private env: Bindings) {
		this.app.get('/token', async c => {
			const data = await this.state.storage.get(['token', 'revoked'])

			if (data.get('revoked') === true) return c.json({ success: false, error: 'auth was revoked' }, 401)

			const token = data.get('token') as { access_token: string, refresh_token: string, id_token?: string | null, expires_at: number } | null | undefined

			if (!token) return c.json({ success: false, error: 'not logged in' }, 404)

			if (token.expires_at < Date.now()) {
				const result = await this.refreshToken(token.refresh_token, token.id_token)

				return c.json(result, result.success ? 200 : 500)
			}

			safe(() => {
				const info = parseIdToken(token.id_token ?? '')

				c.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/get-token', info?.sub ?? '', info?.preferred_username ?? '', this.state.id.toString()],
					indexes: ['authentication']
				})
			})

			return c.json({
				success: true,
				access_token: token.access_token,
				id_token: token.id_token
			})
		})

		this.app.post('/token', async c => {
			const data = await this.state.storage.get(['token', 'revoked'])

			if (data.get('revoked') === true) return c.json({ success: false, error: 'auth was revoked' }, 401)

			const token = data.get('token') as { refresh_token: string, id_token?: string | null } | null | undefined

			if (!token) return c.json({ success: false, error: 'not found' }, 404)

			const result = await this.refreshToken(token.refresh_token, token.id_token)

			return c.json(result, result.success ? 200 : 500)
		})

		this.app.post('/login', async c => {
			const parsed = await safe<{ access_token: string, refresh_token: string, id_token: string, expires_in: number }>(
				c.req.json()
			)

			if (!parsed.success) return c.json({ success: false, error: parsed.error }, 400)

			const token = parsed.data

			await this.state.storage.put({
				token: {
					...token,
					expires_at: createDate(new TimeSpan(token.expires_in - 30, 's')).getTime()
				},
				revoked: false
			})

			const info = parseIdToken(token.id_token)
			if (info) this.eventsub(info.sub)

			safe(() => {
				c.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/login', info?.sub ?? '', info?.preferred_username ?? '', this.state.id.toString()],
					indexes: ['authentication']
				})
			})

			return c.json({ success: true })
		})

		this.app.post('/user', async c => {
			const parsed = await safe<{ user_id: string, user_login: string, user_name: string }>(c.req.json())
			if (!parsed.success) return c.json({ success: false, error: parsed.error }, 400)

			const data = await this.state.storage.get('token') as { [key: string]: any } | undefined
			if (!data) return c.json({ success: false, error: 'not found' }, 404)

			const user = parsed.data

			await this.state.storage.put('token', {
				...data,
				id_token: generateIdToken({ id: user.user_id, login: user.user_login, display_name: user.user_name })
			})
		})

		this.app.post('/revoked', async c => {
			const data = await this.state.storage.get('token') as { access_token: string, refresh_token: string, id_token?: string | null, expires_at: number } | null | undefined
			// TODO: Double check that the token is actually revoked with validate token endpoint

			this.state.storage.put({ revoked: true })
			await this.state.storage.delete('token')

			safe(() => {
				const info = parseIdToken(data?.id_token ?? '')
				c.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/revoke', info?.sub ?? '', info?.preferred_username ?? '', this.state.id.toString()],
					indexes: ['authentication']
				})
			})

			return c.json({ success: true })
		})

		this.app.get('/app/token', async c => {
			const data = await this.state.storage.get('token') as { access_token: string, expires_at: number } | undefined

			if (!data || data.expires_at < Date.now()) {
				const result = await this.generateAppToken()

				return c.json(result, result.success ? 200 : 500)
			}

			safe(() => {
				c.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/get-app-token'],
					indexes: ['authentication']
				})
			})

			return c.json({ success: true, access_token: data.access_token })
		})

		this.app.post('/app/token', async c => {
			const result = await this.generateAppToken()

			return c.json(result, result.success ? 200 : 500)
		})
	}

	async fetch(request: Request) { return this.app.fetch(request, this.env) }

	async refreshToken(refresh_token: string, id_token?: string | null) {
		return this.state.blockConcurrencyWhile(async () => {
			const userInfo = parseIdToken(id_token ?? '')

			const response = await safe(
				getTwitchToken({
					grant_type: 'refresh_token',
					refresh_token,
					env: this.env
				})
			)

			if (!response.success) {
				safe(() => {
					this.env.FollowageApp.writeDataPoint({
						blobs: ['refresh/twitch', `Could not refresh Twitch auth token: ${response.error.message}`, userInfo?.sub ?? '', userInfo?.preferred_username ?? '', this.state.id.toString()],
						indexes: ['errors']
					})
				})

				if (response.error.message.toLowerCase().includes('invalid refresh token')) {
					this.state.storage.put({ revoked: true })
					await this.state.storage.delete('token')

					return { success: false, refreshed: true, error: 'auth was revoked' }
				}

				return { success: false, refreshed: true }
			}

			const token = response.data

			await this.state.storage.put({
				token: {
					id_token,
					...token,
					expires_at: createDate(new TimeSpan(token.expires_in - 30, 's')).getTime()
				},
				revoked: false
			})

			safe(() => {
				this.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/refresh', userInfo?.sub ?? '', userInfo?.preferred_username ?? '', this.state.id.toString()],
					indexes: ['authentication']
				})
			})

			return {
				success: true,
				refreshed: true,
				access_token: token.access_token,
				id_token
			}
		})
	}

	async generateAppToken() {
		return this.state.blockConcurrencyWhile(async () => {
			const response = await safe(
				getTwitchToken({
					grant_type: 'client_credentials',
					env: this.env
				})
			)

			if (!response.success) {
				this.env.FollowageApp.writeDataPoint({
					blobs: ['generate/twitch', `Could not generate Twitch app token: ${response.error.message}`],
					indexes: ['errors']
				})

				return { success: false, error: response.error.message }
			}

			const token = response.data

			await this.state.storage.put('token', {
				...token,
				expires_at: createDate(new TimeSpan(token.expires_in - 30, 's')).getTime()
			})

			safe(() => {
				this.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/generate-app-token'],
					indexes: ['authentication']
				})
			})

			return { success: true, refreshed: true, access_token: token.access_token }
		})
	}

	// TODO: Make eventsub its own durable object that handles all eventsub subscriptions?
	async eventsub(user_id: string) {
		const result = safe(async () => {
			const existing = await this.state.storage.get('eventsub') as { id: string, type: string }[] | undefined

			const needed = [...EVENTS].filter(sub => !existing?.some(e => e.type === sub))

			if (needed.length === 0) return

			const token = await getTwitchAppToken(this.env)

			const results = await Promise.allSettled(needed.map(sub => {
				return fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${token}`,
						'Client-Id': this.env.TWITCH_CLIENT_ID,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						type: sub,
						version: '1',
						condition: sub === 'user.update' ? { user_id } : { broadcaster_user_id: user_id },
						transport: {
							method: 'webhook',
							callback: `${this.env.WEBHOOK_BASE_URL}/twitch/webhook/${sub.split('.')[0]}`,
							secret: this.env.WEBHOOK_SECRET
						}
					})
				}).then(r => r.json()).then(r => object({ data: array(object({ id: string(), type: string() })) }).parse(r))
			}))

			const new_subs: { id: string, type: string }[] = []

			for (const result of results) {
				if (result.status === 'fulfilled') new_subs.push(...result.value.data)

				if (result.status === 'rejected')
					safe(() => {
						this.env.FollowageApp.writeDataPoint({
							blobs: ['twitch/eventsub', `Could not create eventsub subscription: ${result.reason.message}`, user_id],
							indexes: ['errors']
						})
					})
			}

			if (new_subs.length) await this.state.storage.put('eventsub', [...existing ?? [], ...new_subs])
		})

		if (!result.success) {
			safe(() => {
				this.env.FollowageApp.writeDataPoint({
					blobs: ['twitch/eventsub', `Failed to run create eventsub subscriptions: ${result.error.message}`, user_id],
					indexes: ['errors']
				})
			})
		}
	}
}
