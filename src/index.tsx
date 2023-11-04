/** @jsx jsx */
import { jsx } from 'hono/jsx'

import { Hono } from 'hono/quick'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { safe, getBaseUrl, getTwitchAuthLink } from './utils'
import { getTwitchToken, parseIdToken } from './utils/twitch'

import TwitchCommandRoutes from './routes/twitch/commands'
import TwitchWebhookRoutes from './routes/twitch/webhooks'

const TSID_COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 7, httpOnly: true, path: '/' }

const app = new Hono<{ Bindings: Bindings }>()

// TODO: Make a command builder form for the followage command? (Probably needs JS)
// Option 1: Chatbot (Nightbot)
// Option 2: format (years / months / weeks / days / hours / minutes / seconds)
// Option 3: act as moderator?
// Add a button to copy the command to the clipboard

app.get('/', async c => {
	const tsid = getCookie(c, 'tsid')

	const token = tsid ? await safe(
		c.env.AuthTokens.get(
			c.env.AuthTokens.idFromString(tsid)
		).fetch('https://fake/token')
	) : null

	const data = token ? token.success ? await safe(token.data.json<{ id_token: string }>()) : null : null

	const login = data?.success && typeof data.data.id_token === 'string' ? parseIdToken(data.data.id_token) : null

	if (tsid) {
		if (!login) deleteCookie(c, 'tsid')
		else setCookie(c, 'tsid', tsid, TSID_COOKIE_OPTIONS)
	}

	safe(() => {
		c.env.FollowageApp.writeDataPoint({
			blobs: ['/', c.req.raw.cf?.colo as string ?? '', login ? 'authenticated' : 'unauthenticated'],
			indexes: ['page_views']
		})

		if (tsid && !login) {
			const e = safe(() => {
				if (!token) return 'No token?'
				if (!token.success) return `Token error: ${token.error.message}`
				if (token.data.status !== 200) return `Bad status code: ${token.data.status}`

				if (!data) return 'No data?'
				if (!data.success) return `Data error: ${data.error.message}`
				if (typeof data.data.id_token !== 'string') return 'No id_token?'
				if (!login) return 'No login?'
				return 'this should not happen?'
			})

			c.env.FollowageApp.writeDataPoint({
				blobs: ['/', `User has a session cookie but unable to get login data. ${e.success ? e.data : ''}`, tsid, '', '', c.req.raw.cf?.colo as string ?? ''],
				indexes: ['errors']
			})
		}
	})

	const span = (color: string, value: string) => <span style={`color: ${color};`}>{value}</span>

	return c.html(
		<html>
			<head>
				<title>Garret | Chatbot Command APIs</title>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</head>
			<body>
				<h1 style="padding-bottom: 20px;">
					Chatbot Command APIs
				</h1>

				{login ? (
					<p>
						Logged in as {span('green', login.preferred_username)} ({span('green', login.sub)})
					</p>
				) : (
					<a href={getTwitchAuthLink(c.req.url, c.env.TWITCH_CLIENT_ID)} style="padding: 15px 25px; color: white; background-color: purple; text-decoration: none; border-radius: 20px;">
						Login With Twitch
					</a>
				)}


				<h3 style="padding-top: 20px;">
					Commands:
				</h3>

				<details open>
					<summary>Followage Command (Login Required)</summary>

					<div>
						<code style="display: block; padding-top: 20px; padding-bottom: 20px;">
							{getBaseUrl(c.req.url)}/twitch/followage/{span('green', '{StreamerUsername}')}/{span('green', '{ViewerUsername}')}?format={span('green', '{Format}')}&moderatorId={span('green', '{ModeratorId}')}
						</code>

						<h4>Example Formats:</h4>

						<p>
							<code>{span('green', 'ymwdhis')} - x years, x months, x weeks, x days, x hours, x minutes, x seconds.</code>
						</p>

						<p>
							<code style="margin-top: 5px;">{span('green', 'ymdhis (default)')} - x years, x months, x days, x hours, x minutes, x seconds.</code>
						</p>

						<p>
							<code style="margin-top: 5px;">{span('green', 'ym')} - x years, x months.</code>
						</p>

						<p>The format can be any combination of years/months/weeks/days/hours/minutes/seconds. The only requirement is that they appear in the correct order (i.e. days cannot come before years).</p>
					</div>

					<details open style="margin-left: 15px; padding-top: 10px;">
						<summary>Nightbot</summary>

						<div style="margin-left: 30px; padding-top: 20px;">
							<details open>
								<summary>Using Streamer Login</summary>
								<p><code>!commands add !followage $(urlfetch {getBaseUrl(c.req.url)}/twitch/followage/$(channel)/$(touser))</code></p>
							</details>

							<details style="padding-top: 20px;">
								<summary>Using Moderator Login</summary>
								<p><code>!commands add !followage $(urlfetch {getBaseUrl(c.req.url)}/twitch/followage/$(channel)/$(touser)?moderatorId={login ? login.sub : '{moderatorId}'})</code></p>
							</details>
						</div>
					</details>
				</details>
			</body>
		</html>
	)
})

app.get('/auth/twitch/callback', async c => {
	const params = c.req.query()

	// TODO: Handle errors better
	if (typeof params.error === 'string' && params.error.length) {
		const description = typeof params.error_description === 'string' && params.error_description.length ? `: ${params.error_description.replaceAll('+', ' ')}` : ''

		return c.text(`Failed to login, ${params.error}${description}. Please try again.`)
	}

	if (typeof params.code !== 'string') {
		return c.text('Failed to login, no code. Please try again.', 400)
	}

	if (typeof params.scope !== 'string') {
		return c.text('Failed to login, invalid scope. Please try again.', 400)
	}

	const scopes = params.scope.split(' ')

	if (!scopes.includes('moderator:read:followers') || !scopes.includes('openid')) {
		return c.text('Failed to login, invalid scopes. Please try again.', 400)
	}

	const token = await safe(
		getTwitchToken({
			env: c.env,
			grant_type: 'authorization_code',
			code: params.code,
			redirect_uri: `${getBaseUrl(c.req.url)}/auth/twitch/callback`
		})
	)

	if (!token.success) {
		const error = safe(() => JSON.parse(token.error.message))

		if (error.success && error.data.message.toLowerCase().includes('invalid authorization code'))
			return c.text(`Failed to login, authorization code is invalid. Please try again.`)

		safe(() => {
			c.env.FollowageApp.writeDataPoint({
				blobs: ['logins/twitch', `Could not get Twitch auth token: ${token.error.message}`, '', '', '', c.req.raw.cf?.colo as string ?? ''],
				indexes: ['errors']
			})
		})

		return c.text('Failed to login, twitch error. please try again.', 400)
	}

	if (typeof token.data.id_token !== 'string') {
		return c.text('Failed to login, invalid id token. Please try again.', 400)
	}

	const data = parseIdToken(token.data.id_token)

	if (data === null) {
		return c.text('Failed to login, invalid id token. Please try again.', 400)
	}

	// TODO: Does id token contain the login name and display name?
	// c.executionCtx?.waitUntil(safe(
	// 	c.env.KV.put(`Twitch/Logins/${login.toLowerCase()}`, JSON.stringify({ id: data.sub, login, display_name }), { expirationTtl: 60 * 60 * 24 * 7 })
	// ))

	const stub = c.env.AuthTokens.get(
		c.env.AuthTokens.idFromName(data.sub)
	)

	const save = await safe(stub.fetch('https://fake/login', { method: 'POST', body: JSON.stringify(token.data) }))

	if (!save.success || save.data.status !== 200) {
		const text = save.success ? await save.data.text() : save.error.message

		safe(() => {
			c.env.FollowageApp.writeDataPoint({
				blobs: ['logins/twitch', `Could not get current Twitch user: ${text}`, '', '', '', c.req.raw.cf?.colo as string ?? ''],
				indexes: ['errors']
			})
		})

		return c.text('Failed to login, internal error. please try again.', 400)
	}

	setCookie(c, 'tsid', stub.id.toString(), TSID_COOKIE_OPTIONS)

	return c.redirect('/', 302)
})

app.route('/twitch/webhook', TwitchWebhookRoutes)
app.route('/twitch', TwitchCommandRoutes)

export default { fetch: app.fetch }
export { default as AuthTokens } from './durable-objects/auth-tokens'
