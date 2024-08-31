/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./**/*.{html,js}'],
	plugins: [require('daisyui')],
	daisyui: {
		logs: false,
		themes: [
			"dark"
		],
	}
}