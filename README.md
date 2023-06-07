# ROC *(solid like a rock)*

ROC est un framework imaginé pour être le plus facile à utiliser pour ceux qui ont l'habitude de développer des sites web avec du HTML et du JavaScript.

ROC embarque nativement des outils pour faciliter le développement comme une optimisation des fichiers lors du build, un serveur de développement avec rafraîchissement automatique, un système de routage et plus encore.


### Création d'un projet

ROC ne contient pas de CLI, il faut donc créer un projet manuellement. Pour cela, il suffit d'exécuter les commandes suivantes :

```bash
git clone https://github.com/johan-perso/roc-framework.git
cd roc-framework
npm install
# ou pnpm install
```

> Vous pourrez ensuite supprimer le dossier `.git` si vous le souhaitez, puis commencez à coder en modifiant `public/index.html` !


### Développement

Pour lancer le serveur de développement, il suffit d'exécuter la commande suivante :

```bash
npm run dev
# ou pnpm dev
```

> Un serveur de développement sera lancé sur le port 3000 par défaut, vous pouvez changer ce port dans le fichier `roc.config.js`.


### Build

La construction d'un projet permet d'optimiser les fichiers pour une utilisation en production. Ceux-ci seront ensuite utilisables pour un déploiement sur des services comme GitHub Pages ou Vercel. Pour construire un projet, il suffit d'exécuter la commande suivante :

```bash
npm run build
# ou pnpm build
```

> Les fichiers seront placés dans le dossier `build` par défaut, vous pouvez changer l'emplacement dans le fichier `roc.config.js`.


### Configuration

La configuration de ROC se fait en modifiant le fichier `roc.config.js`. Ce fichier contient un objet avec les propriétés suivantes :

* `useTailwindCSS` | `boolean` : détermine si Tailwind CSS doit être utilisé ou non
* `buildDir` | `string` : chemin vers le dossier de build
* `minifyHtml` | `boolean` : détermine si le code HTML doit être minifié ou non (Tailwind CSS est toujours minifié)
* `devPort` | `number` : port du serveur de développement (la variable d'environnement `PORT` restera prioritaire)
* `devOpenBrowser` | `boolean` : détermine si le navigateur doit s'ouvrir automatiquement lors du lancement du serveur de développement


### Utilisation de Tailwind CSS

[Tailwind CSS](https://tailwindcss.com/) permet de styliser une page web plus simplement, et sans écrire de CSS soi-même. Pour l'utiliser avec ROC, il suffit de modifier la propriété `useTailwindCSS` dans le fichier `roc.config.js`.

Le contenu de toutes les pages web HTML inclura automatiquement Tailwind CSS. Il est cependant possible de désactiver Tailwind CSS pour une page en particulier via le fichier de routage.

Pour ajouter du CSS personnalisé, il suffit de créer un fichier `style.css` dans le dossier `public`, ce fichier sera directement inclus dans le CSS généré avec Tailwind CSS.

> Pour plus d'informations sur le fonctionnement de Tailwind CSS, vous pouvez consulter leur [documentation](https://tailwindcss.com/docs).


### Utilisation du routage

ROC embarque un système de routage simple à utiliser.

Tous les fichiers .html dans le dossier `public` seront automatiquement considérés comme des pages web et bénéficieront de fonctionnalité comme la minification, l'utilisation de Tailwind CSS et le rafraîchissement automatique pendant le développement. Les autres fichiers seront également accessibles sans ces fonctionnalités.

Vous pouvez aussi ajouter une route personnalisée depuis le fichier de routage `public/_routing.json`. Ce fichier doit contenir un objet par route, avec ce format : `"/chemin/vers/la/page": { "method": "...", "options": { ... } }`.

* `method` | `string` : méthode HTTP à utiliser pour cette route (GET par défaut), ne fonctionne qu'avec le serveur de développement.
* `options` | `object` : options pour cette route, voir ci-dessous.

Les options disponibles sont les suivantes :

* `redirect` | `string` : redirige vers une autre route, incompatible avec `showFile`.
* `disableTailwind` | `boolean` : désactive Tailwind CSS pour cette route.
* `preventMinify` | `boolean` : désactive la minification pour cette route, s'il s'agit d'une page HTML.
* `forceMinify` | `boolean` : force la minification pour cette route, s'il s'agit d'une page HTML.
* `showFile` | `string` : affiche un fichier, incompatible avec `redirect`.

> Les routes sont prioritaires sur les fichiers, si une route est définie pour une page, le fichier ne sera pas utilisé.  
> Une route doit inclure l'option `showFile` ou `redirect` pour fonctionner. Si elle ne contient aucun des deux mais qu'un fichier existe, celui-ci sera utilisé avec la méthode définie dans `method` si disponible (sinon, `GET`).

Exemple :

```json
{
	"/ex": {
		"options": {
			"redirect": "exemple",
			"disableTailwind": true,
			"preventMinify": true,
		}
	},
	"/accueil": {
		"options": {
			"forceMinify": true,
			"showFile": "public/index.html"
		}
	},
	"/test": {
		"method": "POST",
		"options": {
			"showFile": "public/test.txt"
		}
	}
}
```


### Exécution de code côté serveur pendant le build

Il est possible depuis une page HTML d'exécuter du code JavaScript côté serveur lors du build. Pour cela, vous n'avez qu'à inclure du code entre doubles accolades (`{{ ... }}`) dans votre page HTML.

Exemple :

```html
<p>Compiled at {{ new Date().toLocaleString() }}</p>
```
produira :
```html
<p>Compiled at 07/06/2023, 11:38:45</p>
```

Le code est exécuté avec Node.js, il est donc possible d'utiliser des modules Node.js.

Exemple :

```html
<p>Random number: {{ Math.random() }}</p>
```
produira :
```html
<p>Random number: 0.2013490904951581</p>
```


### Licence

MIT © [Johan](https://johanstick.me)
