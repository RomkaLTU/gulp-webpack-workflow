'use strict';

import plugins       from 'gulp-load-plugins'
import yargs         from 'yargs'
import browser       from 'browser-sync'
import gulp          from 'gulp'
import panini        from 'panini'
import rimraf        from 'rimraf'
import yaml          from 'js-yaml'
import fs            from 'fs'
import webpackStream from 'webpack-stream'
import webpack4      from 'webpack'
import named         from 'vinyl-named'
import sherpa        from 'style-sherpa'
import postcss       from 'gulp-postcss'
import tailwind      from 'tailwindcss'

// Load all Gulp plugins into one variable
const $ = plugins();

// Check for --production flag
const PRODUCTION = !!(yargs.argv.production);

// Load settings from settings.yml
const { COMPATIBILITY, PORT, PATHS } = loadConfig();

function loadConfig() {
    let ymlFile = fs.readFileSync('config.yml', 'utf8');
    return yaml.load(ymlFile);
}

// Build the "dist" folder by running all of the below tasks
gulp.task('build',
    gulp.series(clean, gulp.parallel(pages, javascript, copy), sass, tailwindcss, styleGuide));

// Build the site, run the server, and watch for file changes
gulp.task('default',
    gulp.series('build', server, watch));

// Delete the "dist" folder
// This happens every time a build starts
function clean(done) {
    rimraf(PATHS.dist, done);
}

// Copy files out of the assets folder
// This task skips over the "img", "js", and "scss" folders, which are parsed separately
function copy() {
    return gulp.src(PATHS.assets)
        .pipe(gulp.dest(PATHS.dist + '/assets'));
}

// Generate a style guide from the Markdown content and HTML template in styleguide/
function styleGuide(done) {
    sherpa('src/styleguide/index.md', {
        output: PATHS.dist + '/styleguide.html',
        template: 'src/styleguide/template.html'
    }, done);
}

// Copy page templates into finished HTML files
function pages() {
    return gulp.src('src/pages/**/*.{html,hbs,handlebars}')
        .pipe(panini({
            root: 'src/pages/',
            layouts: 'src/layouts/',
            partials: 'src/partials/',
            data: 'src/data/',
            helpers: 'src/helpers/'
        }))
        .pipe(gulp.dest(PATHS.dist))
        .pipe(browser.reload({ stream: true }));
}

// Load updated HTML templates and partials into Panini
function resetPages(done) {
    panini.refresh();
    done();
}

// TailwindCSS
// https://tailwindcss.com/docs/what-is-tailwind/
function tailwindcss() {
    return gulp.src('./src/assets/tailwind/tailwind.css')
        .pipe(postcss([
            tailwind('./src/assets/tailwind/tailwind.config.js'),
            require('autoprefixer'),
            require("postcss-preset-env"),
            require('cssnano')({
                preset: 'default',
            }),
        ]))
        .pipe(gulp.dest(PATHS.dist + '/assets/css'))
        .pipe(browser.reload({ stream: true }));
}

// Compile SCSS into CSS
// In production, the CSS is compressed
function sass() {
    return gulp.src('src/assets/scss/**/*.scss')
        .pipe($.sourcemaps.init())
        .pipe($.sass({
            includePaths: PATHS.sass
        }).on('error', $.sass.logError))
        .pipe($.autoprefixer())
        .pipe($.if(!PRODUCTION, $.sourcemaps.write()))
        .pipe(gulp.dest(PATHS.dist + '/assets/css'))
        .pipe(browser.reload({ stream: true }));
}

let webpackConfig = {
    externals: { jquery: 'jQuery' },
    mode: (PRODUCTION ? 'production' : 'development'),
    module: {
        rules: [
            {
                test: /.js$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env'],
                            compact: false
                        }
                    }
                ]
            },
            {
                test:/\.css$/,
                use:['style-loader','css-loader']
            }
        ]
    },
    devtool: !PRODUCTION && 'source-map'
};

// Combine JavaScript into one file
// In production, the file is minified
function javascript() {
    return gulp.src(PATHS.entries)
        .pipe(named())
        .pipe($.sourcemaps.init())
        .pipe(webpackStream(webpackConfig, webpack4))
        .pipe($.if(PRODUCTION, $.uglify()
            .on('error', e => { console.log(e); })
        ))
        .pipe($.if(!PRODUCTION, $.sourcemaps.write()))
        .pipe(gulp.dest(PATHS.dist + '/assets/js'));
}

// Start a server with BrowserSync to preview the site in
function server(done) {
    browser.init({
        server: PATHS.dist, port: PORT
    });
    done();
}

// Watch for changes to static assets, pages, Sass, and JavaScript
function watch() {
    gulp.watch(PATHS.assets, copy);
    gulp.watch('src/pages/**/*.html').on('all', gulp.series(pages));
    gulp.watch('src/{layouts,partials}/**/*.html').on('all', gulp.series(resetPages, pages));
    gulp.watch('src/assets/tailwind/**/*').on('all', gulp.series(tailwindcss));
    gulp.watch('src/assets/scss/**/*.scss').on('all', sass);
    gulp.watch('src/assets/js/**/*.js').on('all', gulp.series(javascript, browser.reload));
    gulp.watch('src/assets/img/**/*').on('all', gulp.series(browser.reload));
    gulp.watch('src/styleguide/**').on('all', gulp.series(browser.reload));
    gulp.watch('src/styleguide/**').on('all', gulp.series(styleGuide, browser.reload));
}
