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

export const randomNumber = (from: number, to: number, not?: number[]): number => {
	if (from > to) throw new TypeError('`from` must be less than or equal to `to`')

	const range = to - from
	const randomBuffer = new Uint32Array(1)

	crypto.getRandomValues(randomBuffer)

	const result = from + Math.floor((randomBuffer[0] / (0xffffffff + 1)) * range)

	if (not?.includes(result)) return randomNumber(from, to, not)

	return result
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
