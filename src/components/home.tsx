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
		api: `${base}/twitch/followage/{StreamerUsername}/{ViewerUsername}?format={Format}&moderatorId={ModeratorId}`,
		requiresLogin: true,
		notes: (
			<div>
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
