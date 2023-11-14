/** @jsx jsx */
import { jsx } from 'hono/jsx'

import { Hono } from 'hono/quick'
import { setCookie } from 'hono/cookie'
import { renderToReadableStream, Suspense } from 'hono/jsx/streaming'
import { safe, getBaseUrl, Twitch_Auth_Scopes, TSID_COOKIE_OPTIONS } from './utils'
import { generateIdToken, getTwitchCurrentUser, getTwitchToken } from './utils/twitch'

import TwitchCommandRoutes from './routes/twitch/commands'
import TwitchWebhookRoutes from './routes/twitch/webhooks'
import Home, { UnauthenticatedHome } from './components/home'

const app = new Hono<{ Bindings: Bindings }>()

// TODO: Make a command builder form for the followage command? (Probably needs JS)
// Option 1: Chatbot (Nightbot)
// Option 2: format (years / months / weeks / days / hours / minutes / seconds)
// Option 3: act as moderator?
// Add a button to copy the command to the clipboard

app.get('/', async c => {
	const stream = renderToReadableStream(
		<html>
			<head>
				<title>Garret | Chatbot Command APIs</title>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</head>
			<body>
				<Suspense fallback={<UnauthenticatedHome c={c} />}>
					<Home c={c} />
				</Suspense>
			</body>
		</html>
	)

	return c.body(stream, {
		headers: {
			'Content-Type': 'text/html; charset=UTF-8',
			'Transfer-Encoding': 'chunked'
		}
	})
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

	if (!Twitch_Auth_Scopes.every(scope => scopes.includes(scope))) {
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

	const user = await safe(getTwitchCurrentUser({ env: c.env, token: token.data.access_token, ctx: c.executionCtx }))

	if (!user.success) {
		safe(() => {
			c.env.FollowageApp.writeDataPoint({
				blobs: ['logins/twitch', `Could not get current Twitch user: ${user.error.message}`, '', '', '', c.req.raw.cf?.colo as string ?? ''],
				indexes: ['errors']
			})
		})

		return c.text('Failed to login, twitch error. please try again.', 400)
	}

	const stub = c.env.AuthTokens.get(
		c.env.AuthTokens.idFromName(user.data.id)
	)

	const save = await safe(
		stub.fetch('https://fake/login', {
			method: 'POST',
			body: JSON.stringify({
				...token.data,
				id_token: generateIdToken(user.data)
			})
		})
	)

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
