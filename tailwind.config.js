/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./public/**/*.{html,js}'],
	plugins: [require('daisyui')],
	daisyui: {
		logs: false,
		themes: [
			"dark"
		],
	}
}