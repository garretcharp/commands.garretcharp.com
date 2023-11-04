import type { Context, Env, MiddlewareHandler } from 'hono'

import { object } from 'zod'
import { HMAC } from 'oslo/crypto'
import { encodeHex } from 'oslo/encoding'
import { constantTimeEqual, safe } from '../index'
import { WebhookChallenge, WebhookMessageTypes, WebhookNotification, WebhookRevocation, WebhookSubscription } from './schemas'

type GetWebhookSecretParams<E extends Env, P extends string> = {
	ctx: Context<E, P>
	subscription: typeof WebhookSubscription._type
}

type WebhookSubscribeParams<E extends Env, P extends string> = {
	ctx: Context<E, P>
	event: typeof WebhookChallenge._type
}

type WebhookNotificationParams<E extends Env, P extends string> = {
	ctx: Context<E, P>
	event: typeof WebhookNotification._type
}

type WebhookUnsubscribeParams<E extends Env, P extends string> = {
	ctx: Context<E, P>
	event: typeof WebhookRevocation._type
}

interface EventSubOptions<E extends Env, P extends string> {
	subscriptionTypes?: ('user.authorization.grant' | string)[]
	getWebhookSecret(params: GetWebhookSecretParams<E, P>): Promise<string> | string

	onSubscribe?(params: WebhookSubscribeParams<E, P>): Promise<void> | void
	onNotification(params: WebhookNotificationParams<E, P>): Promise<void> | void
	onUnsubscribe?(params: WebhookUnsubscribeParams<E, P>): Promise<void> | void

	onError?(params: { ctx: Context<E, P>, error: Error }): Promise<void> | void
}

const isDateValid = (date: string) => Number.isFinite(new Date(date).getTime())

const hmac = new HMAC('SHA-256')

const verifySignature = async (secret: string, id: string, timestamp: string, body: string, signature: string) => {
	const message = await hmac.sign(
		new TextEncoder().encode(secret),
		new TextEncoder().encode(`${id}${timestamp}${body}`)
	)

	return constantTimeEqual(
		signature.slice(7),
		encodeHex(message)
	)
}

export const EventSub = <E extends Env = {}, P extends string = ''>(options: EventSubOptions<E, P>): MiddlewareHandler<E, P> => {
	return async (c): Promise<Response> => {
		const signature = c.req.header('Twitch-Eventsub-Message-Signature')
		if (typeof signature !== 'string' || !signature.startsWith('sha256=') || signature.length < 8) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('No signature or not a sha256 signature')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const subscriptionType = c.req.header('Twitch-Eventsub-Subscription-Type')

		if (typeof subscriptionType !== 'string') {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Subscription type not provided')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		if (options.subscriptionTypes && !options.subscriptionTypes.includes(subscriptionType)) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error(`Subscription type ${subscriptionType} not allowed`)
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const messageId = c.req.header('Twitch-Eventsub-Message-Id'), messageTimestamp = c.req.header('Twitch-Eventsub-Message-Timestamp')

		if (typeof messageId !== 'string') {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Message Id not provided')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		if (typeof messageTimestamp !== 'string') {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Message Timestamp not provided')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		if (!isDateValid(messageTimestamp)) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Message Timestamp is not a valid date')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const messageType = WebhookMessageTypes.safeParse(c.req.header('Twitch-Eventsub-Message-Type'))

		if (!messageType.success) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error(`Message type "${c.req.header('Twitch-Eventsub-Message-Type')}" is not valid`)
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const body = await c.req.text()

		const parsed = safe(() => JSON.parse(body))

		if (!parsed.success) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Could not parse body as JSON')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const sub = object({ subscription: WebhookSubscription }).safeParse(parsed.data)

		if (!sub.success) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Could not parse subscription')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		const secret = await options.getWebhookSecret({
			ctx: c,
			subscription: sub.data.subscription
		})

		const valid = await verifySignature(
			secret,
			messageId,
			messageTimestamp,
			body,
			signature
		)

		if (!valid) {
			if (options.onError)
				try {
					await options.onError({
						ctx: c,
						error: new Error('Signatures do not match')
					})
				} catch (error) {}

			return c.text('Forbidden', 403)
		}

		if (messageType.data === 'webhook_callback_verification') {
			const challenge = WebhookChallenge.safeParse(parsed.data)

			if (!challenge.success) {
				if (options.onError)
					try {
						await options.onError({
							ctx: c,
							error: new Error('Could not parse challenge')
						})
					} catch (error) {}

				return c.text('Forbidden', 403)
			}

			try {
				if (options.onSubscribe)
					await options.onSubscribe({
						ctx: c,
						event: challenge.data
					})

				return c.text(challenge.data.challenge, 200)
			} catch (error) {
				return c.text('Internal Server Error', 500)
			}
		} else if (messageType.data === 'notification') {
			const notification = WebhookNotification.safeParse(parsed.data)

			if (!notification.success) {
				if (options.onError)
					try {
						await options.onError({
							ctx: c,
							error: new Error('Could not parse notification')
						})
					} catch (error) {}

				return c.text('Forbidden', 403)
			}

			try {
				await options.onNotification({
					ctx: c,
					event: notification.data
				})

				return c.text('ok', 200)
			} catch (error) {
				return c.text('Internal Server Error', 500)
			}
		} else {
			const revocation = WebhookRevocation.safeParse(parsed.data)

			if (!revocation.success) {
				if (options.onError)
					try {
						await options.onError({
							ctx: c,
							error: new Error('Could not parse revocation')
						})
					} catch (error) {}

				return c.text('Forbidden', 403)
			}

			try {
				if (options.onUnsubscribe)
					await options.onUnsubscribe({
						ctx: c,
						event: revocation.data
					})

				return c.text('ok', 200)
			} catch (error) {
				return c.text('Internal Server Error', 500)
			}
		}
	}
}
