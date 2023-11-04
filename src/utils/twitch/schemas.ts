import { literal, number, object, string, enum as zodEnum } from 'zod'

export const WebhookMessageTypes = zodEnum([
	'webhook_callback_verification',
	'notification',
	'revocation'
])

export const WebhookSubscription = object({
	id: string(),
	status: string(),
	type: string(),
	version: string(),
	cost: number().int().nonnegative(),
	condition: object({}).passthrough(),
	transport: object({
		method: literal('webhook'),
		callback: string(),
	}),
	created_at: string().datetime()
}).passthrough()

export const WebhookChallenge = object({
	subscription: WebhookSubscription,
	challenge: string()
}).passthrough()

export const WebhookNotification = object({
	subscription: WebhookSubscription,
	event: object({}).passthrough()
}).passthrough()

export const WebhookRevocation = object({
	subscription: WebhookSubscription
}).passthrough()
