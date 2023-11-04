import { string } from 'zod'

export const FORMATS = string().regex(/^(y)?(m)?(w)?(d)?(h)?(i)?(s)?$/)

export const getFormat = (format?: string): typeof FORMATS._type => {
	const parsed = FORMATS.safeParse(format ?? 'ymdhis')

	return parsed.success ? parsed.data : 'ymdhis'
}

export const getFormattedData = (seconds: number, format: typeof FORMATS._type) => {
	let remaining = seconds

	const result: { years?: number, months?: number, weeks?: number, days?: number, hours?: number, minutes?: number, seconds?: number } = {}

	if (format.includes('y')) {
		result.years = Math.floor(remaining / 31536000)
		remaining %= 31536000
	}

	if (format.includes('m')) {
		result.months = Math.floor(remaining / 2628000)
		remaining %= 2628000
	}

	if (format.includes('w')) {
		result.weeks = Math.floor(remaining / 604800)
		remaining %= 604800
	}

	if (format.includes('d')) {
		result.days = Math.floor(remaining / 86400)
		remaining %= 86400
	}

	if (format.includes('h')) {
		result.hours = Math.floor(remaining / 3600)
		remaining %= 3600
	}

	if (format.includes('i')) {
		result.minutes = Math.floor(remaining / 60)
		remaining %= 60
	}

	if (format.includes('s')) {
		result.seconds = Math.floor(remaining)
	}

	return result
}
