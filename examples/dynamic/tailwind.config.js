/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./public/**/*.{html,js}",
		"./index.js"
	],
	plugins: [require("daisyui")],
	daisyui: {
		logs: false,
		themes: [
			"dark"
		],
	}
}