import { Hono } from 'hono/quick'
import { object, string } from 'zod'
import { safe } from '../../utils'
import { EventSub } from '../../utils/twitch/eventsub'

const routes = new Hono<{ Bindings: Bindings }>()

routes.post(
	'/authorization',
	EventSub<{ Bindings: Bindings }>({
		subscriptionTypes: ['user.authorization.grant', 'user.authorization.revoke'],

		getWebhookSecret({ ctx }) {
			return ctx.env.WEBHOOK_SECRET
		},

		onError({ ctx, error }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: ['webhooks/authorization', `Could not process webhook: ${error.message}`],
					indexes: ['errors']
				})
			})
		},

		onSubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type],
					indexes: ['webhooks/created']
				})
			})
		},

		async onNotification({ ctx, event }) {
			const data = object({ user_id: string(), user_name: string().nullish() }).parse(event.event)

			if (event.subscription.type === 'user.authorization.revoke') {
				const stub = ctx.env.AuthTokens.get(
					ctx.env.AuthTokens.idFromName(data.user_id)
				)

				await stub.fetch('https://fake/revoked', { method: 'POST' })
			}

			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, data.user_id, data.user_name ?? ''],
					indexes: ['webhooks/triggered']
				})
			})
		},

		onUnsubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, event.subscription.status],
					indexes: ['webhooks/revoked']
				})
			})
		}
	})
)

routes.post(
	'/user',
	EventSub<{ Bindings: Bindings }>({
		subscriptionTypes: ['user.update'],

		getWebhookSecret({ ctx }) {
			return ctx.env.WEBHOOK_SECRET
		},

		onError({ ctx, error }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: ['webhooks/user', `Could not process webhook: ${error.message}`],
					indexes: ['errors']
				})
			})
		},

		onSubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type],
					indexes: ['webhooks/created']
				})
			})
		},

		async onNotification({ ctx, event }) {
			const data = object({ user_id: string(), user_name: string() }).parse(event.event)

			const stub = ctx.env.AuthTokens.get(
				ctx.env.AuthTokens.idFromName(data.user_id)
			)

			await stub.fetch('https://fake/user', {
				method: 'POST',
				body: JSON.stringify(data)
			})

			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, data.user_id, data.user_name],
					indexes: ['webhooks/triggered']
				})
			})
		},

		onUnsubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, event.subscription.status],
					indexes: ['webhooks/revoked']
				})
			})
		}
	})
)

routes.post(
	'/stream',
	EventSub<{ Bindings: Bindings }>({
		subscriptionTypes: ['stream.online', 'stream.offline'],

		getWebhookSecret({ ctx }) {
			return ctx.env.WEBHOOK_SECRET
		},

		onError({ ctx, error }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: ['webhooks/stream', `Could not process webhook: ${error.message}`],
					indexes: ['errors']
				})
			})
		},

		onSubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type],
					indexes: ['webhooks/created']
				})
			})
		},

		async onNotification({ ctx, event }) {
			const data = object({ broadcaster_user_id: string(), broadcaster_user_name: string() }).parse(event.event)

			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, data.broadcaster_user_id, data.broadcaster_user_name],
					indexes: ['webhooks/triggered']
				})
			})
		},

		onUnsubscribe({ ctx, event }) {
			safe(() => {
				ctx.env.FollowageApp.writeDataPoint({
					blobs: [event.subscription.type, event.subscription.status],
					indexes: ['webhooks/revoked']
				})
			})
		}
	})
)

export default routes
