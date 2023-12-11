import { type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { parseIdToken } from 'src/utils/twitch'

export const TSID_COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 7, httpOnly: true, path: '/' }

export const getCurrentTwitchLogin = async (c: Context<{ Bindings: Bindings }, "/", {}>) => {
	const tsid = getCookie(c, 'tsid')

	if (!tsid) return null

	const token = await safe(
		c.env.AuthTokens.get(
			c.env.AuthTokens.idFromString(tsid)
		).fetch('https://fake/token')
	)

	if (!token.success) {
		deleteCookie(c, 'tsid')
		return null
	}

	if (token.data.status !== 200) {
		deleteCookie(c, 'tsid')
		return null
	}

	const data = await safe(token.data.json<{ id_token: string }>())

	if (!data.success) {
		deleteCookie(c, 'tsid')
		return null
	}

	if (typeof data.data.id_token !== 'string') {
		deleteCookie(c, 'tsid')
		return null
	}

	const login = parseIdToken(data.data.id_token)

	if (login) setCookie(c, 'tsid', tsid, TSID_COOKIE_OPTIONS)
	else deleteCookie(c, 'tsid')

	return login
}

export const constantTimeEqual = (a: string, b: string) => {
	if (a.length !== b.length) return false

	const aUint8Array = new TextEncoder().encode(a)
	const bUint8Array = new TextEncoder().encode(b)

	let c = 0

	for (let i = 0; i < a.length; i++) {
		c |= aUint8Array[i] ^ bUint8Array[i]
	}

	return c === 0
}

export const getRandomValues = <T>(array: T[], count: number) => {
	const results: T[] = []

	const items = [...array]
	for (let i = 0; i < count; i++) {
		if (items.length === 0) break
		results.push(...items.splice(Math.floor(Math.random() * items.length), 1))
	}

	return results
}

export const getBaseUrl = (url: string) => {
	const current = new URL(url)

	return `${current.protocol}//${current.host}`
}

export const Twitch_Auth_Scopes = ['moderator:read:followers', 'moderator:read:chatters'] as const
export const getTwitchAuthLink = (url: string, client_id: string) => {
	const query = new URLSearchParams({
		client_id,
		redirect_uri: `${getBaseUrl(url)}/auth/twitch/callback`,
		response_type: 'code',
		scope: Twitch_Auth_Scopes.join(' ')
	})

	return `https://id.twitch.tv/oauth2/authorize?${query.toString()}`
}

export type Safe<T> = { success: true; data: T; } | { success: false; error: any; }

async function safeAsync<T> (promise: Promise<T>): Promise<Safe<T>> {
	try {
		const data = await promise
		return { data, success: true }
	} catch (error) {
		return { error, success: false }
	}
}

function safeSync<T> (func: () => T): Safe<T> {
	try {
		const data = func()
		return { data, success: true }
	} catch (error) {
		return { error, success: false }
	}
}

export function safe<T>(promise: Promise<T>): Promise<Safe<T>>
export function safe<T>(func: () => T): Safe<T>
export function safe<T> (promiseOrFunc: Promise<T> | (() => T)): Promise<Safe<T>> | Safe<T> {
	return promiseOrFunc instanceof Promise ? safeAsync(promiseOrFunc) : safeSync(promiseOrFunc)
}
