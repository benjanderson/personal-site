module.exports = {
	purge: {
		enabled: true,
		content: [
		  'src/**/*.html',
		]
	},	
	darkMode: 'media', // or 'media' or 'class'
	theme: {
		screens: {
			sm: { min: '0px', max: '767px' },
			md: '768px',
			lg: { min: '1024px' }
		}
	},
	variants: {
		extend: {}
	},
	plugins: []
};
