import { object, string, number, array } from 'zod'
import { decodeBase64, encodeBase64 } from 'oslo/encoding'
import { safe } from '../index'

const AppTokenResponse = object({
	access_token: string().min(10),
	expires_in: number().min(60)
})

const IDToken = object({
	sub: string().min(1),
	login: string().min(1).optional().nullable(),
	preferred_username: string().min(1)
}).passthrough()

export const generateIdToken = (user: { id: string, login: string, display_name: string }) => {
	const encoded = new TextEncoder().encode(
		JSON.stringify({
			sub: user.id,
			login: user.login,
			preferred_username: user.display_name
		})
	)

	return `fake.${encodeBase64(encoded)}.fake`
}

export const parseIdToken = (token: string) => {
	const parts = token.split('.')

	if (parts.length !== 3) return null

	const parsed = safe(() => IDToken.parse(
		JSON.parse(
			new TextDecoder().decode(decodeBase64(parts[1]))
		)
	))

	return parsed.success ? parsed.data : null
}

const UserTokenResponse = AppTokenResponse.extend({
	refresh_token: string().min(10),
	scope: array(string())
})

type GetTwitchAppToken = {
	env: Bindings
	grant_type: 'client_credentials'
}

type GetTwitchUserToken = {
	env: Bindings
	grant_type: 'authorization_code'
	code: string
	redirect_uri: string
} | {
	env: Bindings
	grant_type: 'refresh_token'
	refresh_token: string
}

export async function getTwitchToken (input: GetTwitchAppToken): Promise<typeof AppTokenResponse._type>
export async function getTwitchToken (input: GetTwitchUserToken): Promise<typeof UserTokenResponse._type>
export async function getTwitchToken (input: GetTwitchAppToken | GetTwitchUserToken): Promise<typeof AppTokenResponse._type | typeof UserTokenResponse._type> {
	const response = await safe(
		fetch('https://id.twitch.tv/oauth2/token', {
			method: 'POST',
			body: new URLSearchParams({
				client_id: input.env.TWITCH_CLIENT_ID,
				client_secret: input.env.TWITCH_CLIENT_SECRET,
				grant_type: input.grant_type,
				...(input.grant_type === 'authorization_code' ? { code: input.code, redirect_uri: input.redirect_uri } : input.grant_type === 'refresh_token' ? { refresh_token: input.refresh_token } : {})
			}),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Client-ID': input.env.TWITCH_CLIENT_ID
			}
		})
	)

	if (!response.success || response.data.status !== 200) {
		if (response.success) throw new Error(await response.data.text())
		else throw response.error
	}

	const text = await response.data.text()
	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get twitch token, twitch response error (unable to parse). Response: ' + text)

	return input.grant_type === 'client_credentials' ? AppTokenResponse.parse(data.data) : UserTokenResponse.parse(data.data)
}

const TokenResponse = object({ access_token: string() })

export const getTwitchAppToken = async (env: Bindings, force?: boolean) => {
	const stub = env.AuthTokens.get(
		env.AuthTokens.idFromName('TwitchApp')
	)

	const get = await safe(stub.fetch('https://fake/app/token', { method: force ? 'POST' : 'GET' }))

	if (!get.success || get.data.status !== 200) {
		if (get.success) throw new Error(await get.data.text())
		else throw get.error
	}

	const text = await get.data.text()

	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get twitch app token, twitch response error (unable to parse). Response: ' + text)

	return TokenResponse.parse(data.data).access_token
}

const getTwitchUserToken = async ({ env, userId, force }: { env: Bindings, userId: string, force?: boolean }) => {
	const stub = env.AuthTokens.get(
		env.AuthTokens.idFromName(userId)
	)

	const token = await safe(stub.fetch('https://fake/token', { method: force === true ? 'POST' : 'GET' }))

	if (!token.success || token.data.status !== 200) {
		if (token.success) throw new Error('Could not get access token. Response: ' + await token.data.text())
		else throw token.error
	}

	const text = await token.data.text()
	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get user token, internal DO response error (unable to parse). Response: ' + text)

	return TokenResponse.parse(data.data).access_token
}

const TwitchUser = object({
	id: string().min(1),
	login: string().min(1),
	display_name: string().min(1)
})

const TwitchUsersResponse = object({
	data: array(TwitchUser)
})

export const getTwitchCurrentUser = async ({ env, token }: { env: Bindings, token: string }) => {
	const response = await safe(
		fetch('https://api.twitch.tv/helix/users', {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Client-ID': env.TWITCH_CLIENT_ID,
				Authorization: `Bearer ${token}`
			}
		})
	)

	if (!response.success || response.data.status !== 200) {
		if (response.success) throw new Error(await response.data.text())
		else throw response.error
	}

	const text = await response.data.text()
	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get users, twitch response error (unable to parse). Response: ' + text)

	const { data: twitchUsers } = TwitchUsersResponse.parse(data.data)

	if (twitchUsers.length !== 1) throw new Error('Failed to get users, twitch response error (invalid response). Response: ' + text)

	return twitchUsers[0]
}

export const getTwitchUsers = async ({ env, logins }: { env: Bindings, logins: string[] }) => {
	const result: Map<string, { id: string, login: string, display_name: string }> = new Map()

	if (logins.length === 0) throw new TypeError('logins must not be empty')

	const token = await getTwitchAppToken(env)

	const responses = await Promise.all(
		[...new Set(logins.map(login => login.toLowerCase()))].map(login =>
			fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Client-ID': env.TWITCH_CLIENT_ID,
					Authorization: `Bearer ${token}`
				},
				cf: {
					cacheEverything: true,
					cacheTtlByStatus: { '200-299': 60 * 60 * 24 * 7, '500-599': 10 }
				}
			})
		)
	)

	for (const response of responses) {
		const text = await response.text()
		const data = safe(() => JSON.parse(text))

		if (!data.success) throw new Error('Failed to get users, twitch response error (unable to read json). Response: ' + text)

		const { data: twitchUsers } = TwitchUsersResponse.parse(data.data)

		for (const user of twitchUsers) {
			result.set(user.login.toLowerCase(), { id: user.id, login: user.login, display_name: user.display_name })
		}
	}

	return result
}

const TwitchFollowResponse = object({
	data: array(object({
		user_id: string({ required_error: 'id is required' }).min(1, { message: 'id is too short' }),
		user_name: string({ required_error: 'name is required' }).min(1, { message: 'name is too short' }),
		followed_at: string({ required_error: 'followed_at is required' }).datetime({ message: 'followed_at is not a valid date' })
	}))
})

type GetTwitchFollowerParams = {
	env: Bindings
	streamer: { id: string, login: string }
	viewer: { id: string, login: string }
	moderator?: string
}

export const getTwitchFollower = async ({ env, streamer, viewer, moderator }: GetTwitchFollowerParams) => {
	const access_token = await getTwitchUserToken({ env, userId: moderator ?? streamer.id })

	const response = await safe(
		fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${streamer.id}&user_id=${viewer.id}`, {
			method: 'GET',
			headers: {
				'Client-ID': env.TWITCH_CLIENT_ID,
				Authorization: `Bearer ${access_token}`
			}
		})
	)

	if (!response.success || response.data.status !== 200) {
		if (response.success) throw new Error(await response.data.text())
		else throw response.error
	}

	const text = await response.data.text()
	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get followers, twitch response error (unable to parse). Response: ' + text)

	return TwitchFollowResponse.parse(data.data).data[0]
}

const TwitchChattersResponse = object({
	data: array(object({
		user_id: string({ required_error: 'id is required' }).min(1, { message: 'id is too short' }),
		user_login: string({ required_error: 'login is required' }).min(1, { message: 'login is too short' }),
		user_name: string({ required_error: 'name is required' }).min(1, { message: 'name is too short' })
	}))
})

type GetTwitchChattersParams = Omit<GetTwitchFollowerParams, 'viewer'>

export const getTwitchChatters = async ({ env, streamer, moderator }: GetTwitchChattersParams) => {
	const access_token = await getTwitchUserToken({ env, userId: moderator ?? streamer.id })

	const response = await safe(
		fetch(`https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${streamer.id}&first=1000&moderator_id=${moderator ?? streamer.id}`, {
			method: 'GET',
			headers: {
				'Client-ID': env.TWITCH_CLIENT_ID,
				Authorization: `Bearer ${access_token}`
			},
			cf: {
				cacheEverything: true,
				cacheTtlByStatus: { '200-299': 60, '500-599': 10 }
			}
		})
	)

	if (!response.success || response.data.status !== 200) {
		if (response.success) throw new Error(await response.data.text())
		else throw response.error
	}

	const text = await response.data.text()
	const data = safe(() => JSON.parse(text))

	if (!data.success) throw new Error('Failed to get chatters, twitch response error (unable to parse). Response: ' + text)

	return TwitchChattersResponse.parse(data.data)
}
