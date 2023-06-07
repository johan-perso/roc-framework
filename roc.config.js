module.exports = {
	// Tailwind CSS
	useTailwindCSS: true,

	// Options de build
	buildDir: 'build', // chemin vers le dossier de build
	minifyHtml: true, // le code HTML sera minifié si activé, Tailwind CSS est toujours minifié

	// Développement
	devPort: 3000, // process.env.PORT restera prioritaire dans tout les cas
	devOpenBrowser: true // ouvrir le navigateur automatiquement quand on démarre le serveur de développement
}