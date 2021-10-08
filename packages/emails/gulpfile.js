const gulp = require('gulp');
const plugins = require('gulp-load-plugins');
const browser = require('browser-sync');
const rimraf = require('rimraf');
const panini = require('panini');
const yargs = require('yargs/yargs');
const lazypipe = require('lazypipe');
const inky = require('inky');
const fs = require('fs');
const siphon = require('siphon-media-query');
const { sass } = require('@mr-hope/gulp-sass');

const $ = plugins();

// Look for the --production flag
const PRODUCTION = !!yargs(process.argv).argv.production;

// Delete the "dist" folder, this happens every time a build starts
function clean(done) {
  rimraf('dist', done);
}

// Compile layouts, pages, and partials into flat HTML files
// Then parse using Inky templates
function pages() {
  return gulp
    .src('src/pages/**/*.html')
    .pipe(
      panini({
        root: 'src/pages',
        layouts: 'src/layouts',
        partials: 'src/partials',
        helpers: 'src/helpers',
      }),
    )
    .pipe(inky())
    .pipe(gulp.dest('dist'));
}

// Reset Panini's cache of layouts and partials
function resetPages(done) {
  panini.refresh();
  done();
}

// Compile Sass into CSS
function buildSass() {
  return gulp
    .src('src/assets/scss/app.scss')
    .pipe($.if(!PRODUCTION, $.sourcemaps.init()))
    .pipe(
      sass({
        includePaths: ['../../node_modules/foundation-emails/scss'],
      }).on('error', sass.logError),
    )
    .pipe($.if(!PRODUCTION, $.sourcemaps.write()))
    .pipe(gulp.dest('dist/css'));
}

// Copy and compress images
function images() {
  return gulp
    .src('src/assets/img/**/*')
    .pipe($.imagemin())
    .pipe(gulp.dest('./dist/assets/img'));
}

// Inlines CSS into HTML, adds media query CSS into the <style> tag of the email, and compresses the HTML
function inliner(css) {
  const content = fs.readFileSync(css).toString();
  const mqCss = siphon(content);

  const pipe = lazypipe()
    .pipe(
      $.inlineCss,
      {
        applyStyleTags: false,
        removeStyleTags: true,
        preserveMediaQueries: true,
        removeLinkTags: false,
      },
    )
    .pipe(
      $.replace,
      '<!-- <style> -->',
      `<style>${mqCss}</style>`,
    )
    .pipe(
      $.replace,
      '<link rel="stylesheet" type="text/css" href="css/app.css">',
      '',
    )
    .pipe(
      $.htmlmin,
      {
        collapseWhitespace: true,
        minifyCSS: true,
      },
    );

  return pipe();
}

// Inline CSS and minify HTML
function inline() {
  return gulp
    .src('dist/**/*.html')
    .pipe($.if(PRODUCTION, inliner('dist/css/app.css')))
    .pipe(gulp.dest('dist'));
}

// Start a server with LiveReload to preview the site in
function server(done) {
  browser.init({ server: 'dist' });
  done();
}

// Watch for file changes
function watch() {
  gulp.watch('src/pages/**/*.html').on('change', gulp.series(pages, inline, browser.reload));
  gulp.watch(['src/layouts/**/*', 'src/partials/**/*']).on('change', gulp.series(resetPages, pages, inline, browser.reload));
  gulp.watch(['../scss/**/*.scss', 'src/assets/scss/**/*.scss']).on('change', gulp.series(resetPages, buildSass, pages, inline, browser.reload));
  gulp.watch('src/assets/img/**/*').on('change', gulp.series(images, browser.reload));
}

// Build the "dist" folder by running all of the above tasks
gulp.task('build', gulp.series(clean, pages, buildSass, images, inline));

// Build emails, run the server, and watch for file changes
gulp.task('default', gulp.series('build', server, watch));
