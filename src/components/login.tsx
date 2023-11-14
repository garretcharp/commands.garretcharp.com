/** @jsx jsx */
import { JSXNode, jsx } from 'hono/jsx'

import { type Context } from 'hono'
import { type getCurrentTwitchLogin, getTwitchAuthLink } from 'src/utils'

type Ctx = Context<{ Bindings: Bindings }, "/", {}>

type LoginParams = { c: Context<{ Bindings: Bindings }, "/", {}> }

const TwitchIcon = (params: any) => (
	<svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" viewBox="0 0 111.78667 127.38667" xml:space="preserve" version="1.1" id="svg3355" sodipodi:docname="Twitch_logo.svg" inkscape:version="1.1.1 (3bf5ae0d25, 2021-09-20)" {...params ?? {}}>
		<sodipodi:namedview id="namedview27" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:pageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" showgrid="false" inkscape:zoom="4.1992284" inkscape:cx="-50.604535" inkscape:cy="140.38293" inkscape:window-width="2560" inkscape:window-height="1387" inkscape:window-x="1912" inkscape:window-y="-8" inkscape:window-maximized="1" inkscape:current-layer="svg3355"/>
		<g transform="matrix(1.3333333,0,0,-1.3333333,101.39333,67.589332)" id="g3365">
			<path id="path3367" style="fill:#6441a5;fill-opacity:1;fill-rule:evenodd;stroke:none" d="m 0,0 -13.652,-13.651 h -21.445 l -11.699,-11.697 v 11.697 H -64.344 V 42.893 H 0 Z m -72.146,50.692 -3.899,-15.599 v -70.19 h 17.55 v -9.751 h 9.746 l 9.752,9.751 h 15.596 L 7.795,-3.905 v 54.597 z"/>
		</g>
		<path id="path3369" style="fill:#6441a5;fill-opacity:1;fill-rule:evenodd;stroke:none;stroke-width:1.33333" d="m 44.197331,62.394266 h 10.39867 V 31.192933 h -10.39867 z m 28.59467,0 h 10.39866 V 31.192933 h -10.39866 z"/>
	</svg>
)

const Styles = "padding: 15px 25px; color: white; background-color: black; border-radius: 20px; display: inline-block;"

export const UnauthenticatedView = ({ c }: LoginParams) => (
	<a href={getTwitchAuthLink(c.req.url, c.env.TWITCH_CLIENT_ID)} style={Styles + "text-decoration: none;"}>
		<TwitchIcon width="30px" style="vertical-align: middle;" />
		<span style="padding-left: 15px; vertical-align: middle;">Login</span>
	</a>
)

const Reload = (params: any) => (
	<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve" {...params ?? {}}>
		<g id="Reload">
			<path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="   M64.641,31.942c5.27,4.25,8.64,10.76,8.64,18.058c0,12.806-10.381,23.188-23.188,23.188c-3.061,0-5.983-0.593-8.658-1.671"/>
			<path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="   M35.926,68.357C30.439,64.116,26.906,57.471,26.906,50c0-12.806,10.381-23.188,23.188-23.188c3.202,0,6.252,0.649,9.026,1.822"/>
			<path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="   M48.777,36.733c4.097-2.869,6.793-4.757,9.78-6.847c0.905-0.634,1.121-1.878,0.487-2.783l-7.149-10.211"/>
			<path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="   M51.829,63.79c-4.097,2.869-6.793,4.756-9.78,6.847c-0.905,0.634-1.121,1.878-0.487,2.783l7.149,10.211"/>
		</g>
	</svg>
)

export const AuthenticatedView = ({ c, login }: LoginParams & { login: NonNullable<Awaited<ReturnType<typeof getCurrentTwitchLogin>>> }) => (
	<span style={Styles}>
		<TwitchIcon width="30px" style="vertical-align: middle;" />
		<span style="padding-left: 15px; vertical-align: middle;">{login.preferred_username}</span>
		<a href={getTwitchAuthLink(c.req.url, c.env.TWITCH_CLIENT_ID)} style="vertical-align: middle;"><Reload width="30px" /></a>
	</span>
)
