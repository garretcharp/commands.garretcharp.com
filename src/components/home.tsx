/** @jsx jsx */
import { jsx } from 'hono/jsx'

import CommandsList from './commands'

import { Context } from 'hono'
import { AuthenticatedView, UnauthenticatedView } from './login'
import { getBaseUrl, getCurrentTwitchLogin, safe } from 'src/utils'

type HomeParams = { c: Context<{ Bindings: Bindings }, "/", {}> }

const span = (color: string, value: string) => <span style={`color: ${color};`}>{value}</span>

const commands = (base: string, login: { sub: string } | null): Parameters<typeof CommandsList>[0]['commands'] => [
	{
		name: 'Followage',
		api: `${base}/twitch/followage/{StreamerUsername}/{ViewerUsername}?format={Format}&ping={true|false}&moderatorId={ModeratorId}`,
		requiresLogin: true,
		notes: (
			<div>
				<p>
					<code>StreamerUsername</code> is the username of the streamer.
				</p>

				<p>
					<code>ViewerUsername</code> is the username of the viewer.
				</p>

				<p>
					<code>format</code> is the format of the output. The default format is <code>ymdhis</code>. More on formats below.
				</p>

				<p>
					<code>ping</code> is whether or not to ping the streamer and viewer in the output.
				</p>

				<p>
					<code>moderatorId</code> is the Twitch ID of the moderator to use for request authentication (if applicable).
				</p>

				<h5 style="margin: 5px 0;">Example Formats:</h5>

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
		),
		chatbots: [
			{
				open: true,
				name: 'Nightbot',
				details: (
					<div>
						<details open>
							<summary>Using Streamer Login</summary>
							<p><code>!commands add !followage $(urlfetch {base}/twitch/followage/$(channel)/$(touser))</code></p>
						</details>

						<details style="padding-top: 20px;">
							<summary>Using Moderator Login</summary>
							<p><code>!commands add !followage $(urlfetch {base}/twitch/followage/$(channel)/$(touser)?moderatorId={login ? login.sub : '{moderatorId}'})</code></p>
							{!login && (<p>Note: Login so that the moderatorId value is populated with your account's Twitch ID.</p>)}
						</details>
					</div>
				)
			}
		]
	},
	{
		name: 'Random Chatter',
		api: `${base}/twitch/chatter/{StreamerUsername}?count={Count}&moderatorId={ModeratorId}`,
		requiresLogin: true,
		notes: (
			<div>
				<p>
					<code>StreamerUsername</code> is the username of the streamer.
				</p>

				<p>
					<code>count</code> is the number of chatters to return. The default is <code>1</code>.
				</p>

				<p>
					<code>moderatorId</code> is the Twitch ID of the moderator to use for request authentication (if applicable).
				</p>
			</div>
		),
		chatbots: [
			{
				open: true,
				name: 'Nightbot',
				details: (
					<div>
						<details open>
							<summary>Using Streamer Login</summary>
							<p><code>!commands add !randomuser $(urlfetch {base}/twitch/chatter/$(channel))</code></p>
						</details>

						<details style="padding-top: 20px;">
							<summary>Using Moderator Login</summary>
							<p><code>!commands add !randomuser $(urlfetch {base}/twitch/chatter/$(channel)?moderatorId={login ? login.sub : '{moderatorId}'})</code></p>
							{!login && (<p>Note: Login so that the moderatorId value is populated with your account's Twitch ID.</p>)}
						</details>
					</div>
				)
			}
		]
	}
]

export const UnauthenticatedHome = ({ c }: HomeParams) => (
	<div>
		<h1>Chatbot Command APIs</h1>

		<UnauthenticatedView c={c} />

		<h3 style="padding-top: 20px;">
			Commands:
		</h3>

		<CommandsList c={c} commands={commands(getBaseUrl(c.req.url), null)} />
	</div>
)

const AuthenticatedHome = ({ c, login }: HomeParams & { login: NonNullable<Awaited<ReturnType<typeof getCurrentTwitchLogin>>> }) => (
	<div>
		<h1>Chatbot Command APIs</h1>

		<AuthenticatedView c={c} login={login} />

		<h3 style="padding-top: 20px;">
			Commands:
		</h3>

		<CommandsList c={c} commands={commands(getBaseUrl(c.req.url), login)} />
	</div>
)

export default async function Home({ c }: HomeParams) {
	const login = await getCurrentTwitchLogin(c)

	safe(() => {
		c.env.FollowageApp.writeDataPoint({
			blobs: ['/', c.req.raw.cf?.colo as string ?? '', login ? 'authenticated' : 'unauthenticated'],
			indexes: ['page_views']
		})
	})

	if (login) return <AuthenticatedHome c={c} login={login} />
	return <UnauthenticatedHome c={c} />
}
