/** @jsx jsx */
import { jsx } from 'hono/jsx'

import { type Context } from 'hono'

type CommandParams = {
	c: Context<{ Bindings: Bindings }, "/", {}>
	command: {
		name: string
		requiresLogin: boolean

		api: string
		notes?: JSX.Element

		chatbots: {
			open: boolean
			name: string

			details: JSX.Element
		}[]
	}
}

const variableReplacer = (string: string) => {
	return string.split(/(\{[^{}]+\})/).map(part => {
		if (part.startsWith('{') && part.endsWith('}'))
			return <span style="color: green;">{part}</span>

		return part
	})
}

const Command = ({ command }: CommandParams) => {
	return (
		<details open style="margin-top: 25px;">
			<summary>{command.name}{command.requiresLogin ? ' (Login Required)' : ''}</summary>

			<div>
				<code style="display: block; padding-top: 20px; padding-bottom: 20px;">
					{variableReplacer(command.api)}
				</code>

				{command.notes}
			</div>

			{command.chatbots.map(chatbot => (
				<details open={chatbot.open} style="margin-left: 15px; padding-top: 10px; padding-bottom: 10px;">
					<summary>{chatbot.name}</summary>

					<div style="margin-left: 30px; padding-top: 20px;">
						{chatbot.details}
					</div>
				</details>
			))}
		</details>
	)
}

type CommandsListParams = {
	c: Context<{ Bindings: Bindings }, "/", {}>
	commands: CommandParams['command'][]
}

export default function CommandsList({ c, commands }: CommandsListParams) {
	return (
		<div>
			{commands.map(command => <Command c={c} command={command} />)}
		</div>
	)
}
