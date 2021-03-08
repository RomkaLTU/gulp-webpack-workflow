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
    gulp.series(clean, gulp.parallel(pages, javascript, copy), css, styleGuide));

// Build the site, run the server, and watch for file changes
gulp.task('default',
    gulp.series('build', server, watch));

// Delete the "dist" folder
// This happens every time a build starts
function clean(done) {
    rimraf(PATHS.dist, done);
}

// Copy files out of the assets folder
// This task skips over the "images", "js", and "scss" folders, which are parsed separately
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

/**
 * @TODO: sourcemaps?
 * @returns {*}
 */
function css() {
    return gulp.src('./src/assets/css/main.css')
        .pipe(postcss([
            require('postcss-import'),
            require('tailwindcss'),
            require('postcss-nested'),
            require('postcss-custom-properties'),
        ]))
        .pipe($.if(PRODUCTION, postcss([
            require('autoprefixer'),
        ])))
        .pipe($.if(PRODUCTION, postcss([
            require('cssnano')({
                preset: 'default',
            }),
        ])))
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

// Watch for changes to static assets, pages, and JavaScript
function watch() {
    gulp.watch(PATHS.assets, copy);
    gulp.watch('src/pages/**/*.html').on('all', gulp.series(pages));
    gulp.watch('src/{layouts,partials,helpers,data}/**/*.html').on('all', gulp.series(resetPages, pages));
    gulp.watch('src/assets/css/**/*').on('all', gulp.series(css));
    gulp.watch('tailwind.config.js').on('all', gulp.series(css));
    gulp.watch('src/assets/js/**/*.js').on('all', gulp.series(javascript, browser.reload));
    gulp.watch('src/assets/images/**/*').on('all', gulp.series(browser.reload));
    gulp.watch('src/styleguide/**').on('all', gulp.series(styleGuide, browser.reload));
}
