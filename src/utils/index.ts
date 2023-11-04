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

export const getBaseUrl = (url: string) => {
	const current = new URL(url)

	return `${current.protocol}//${current.host}`
}

export const getTwitchAuthLink = (url: string, client_id: string) => {
	const query = new URLSearchParams({
		client_id,
		redirect_uri: `${getBaseUrl(url)}/auth/twitch/callback`,
		response_type: 'code',
		scope: 'moderator:read:followers openid'
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
