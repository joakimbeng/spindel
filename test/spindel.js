'use strict';
const test = require('ava');
const nock = require('nock');
const streamToArray = require('stream-to-array');
const cheerio = require('cheerio');
const fn = require('../src');

// wrapper to transform stream to Promise<Array> for easier testing:
const spindel = (...args) => streamToArray(fn(...args));

test.beforeEach(() => {
	nock('http://a.domain.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					Hello world!
				</body>
			</html>
		`, {
			'Content-Type': 'text/html; charset=utf-8'
		});
});

test('html response without links', async t => {
	t.plan(3);

	const [res, ...rest] = await spindel('http://a.domain.com');

	t.is(rest.length, 0);
	t.is(res.statusCode, 200);
	t.is(res.hrefs.length, 0);
});

test('html response with links', async t => {
	t.plan(5);

	nock('http://another.domain.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<a href="http://a.domain.com">Hello world!</a>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const [anotherRes, aRes, ...rest] = await spindel('http://another.domain.com');

	t.is(rest.length, 0);
	t.is(anotherRes.statusCode, 200);
	t.is(anotherRes.hrefs.length, 1);
	t.is(aRes.statusCode, 200);
	t.is(aRes.hrefs.length, 0);
});

test('html response with relative links', async t => {
	t.plan(5);

	nock('http://yetanother.domain.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<a href="/hello">Hello world!</a>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	nock('http://yetanother.domain.com')
		.get('/hello')
		.reply(200, `
			<html>
				<body>
					Hello!
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const [yetRes, helloRes, ...rest] = await spindel('http://yetanother.domain.com');

	t.is(rest.length, 0);
	t.is(yetRes.statusCode, 200);
	t.is(yetRes.hrefs.length, 1);
	t.is(helloRes.statusCode, 200);
	t.is(helloRes.hrefs.length, 0);
});

test('non html response', async t => {
	t.plan(3);

	nock('http://another.domain.com')
		.get('/')
		.reply(200, `
			# Hello world

			Lorem ipsum...
		`, {
			'Content-Type': 'text/plain'
		});

	const [res, ...rest] = await spindel('http://another.domain.com');

	t.is(rest.length, 0);
	t.is(res.statusCode, 200);
	t.is(res.hrefs.length, 0);
});

test('http error response', async t => {
	t.plan(3);

	nock('http://errors.com')
		.get('/')
		.reply(500, `
			Internal Server Error
		`);

	const [res, ...rest] = await spindel('http://errors.com');

	t.is(rest.length, 0);
	t.is(res.statusCode, 500);
	t.is(res.hrefs.length, 0);
});

test('request error response', async t => {
	t.plan(4);

	nock('http://more.errors.com')
		.get('/')
		.replyWithError({code: 'ECONNREFUSED', message: '127.0.0.1'});

	const [res, ...rest] = await spindel('http://more.errors.com/', {gotOptions: {retries: 0}});

	t.is(rest.length, 0);
	t.is(res.code, 'ECONNREFUSED');
	t.is(res.message, '127.0.0.1');
	t.is(res.hrefs.length, 0);
});

test('transformHtml option (sync version)', async t => {
	t.plan(5);

	nock('http://another.domain.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<main>
						<a href="http://a.domain.com">Hello world!</a>
					</main>
					<aside>
						<a href="http://not-important.com">Not important</a>
					</aside>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const notImportant = nock('http://not-important.com')
		.get('/')
		.reply(404);

	const [res, ...rest] = await spindel('http://another.domain.com', {
		transformHtml(body) {
			const $ = cheerio.load(body);
			const main = $('main');
			return main.length ? main.html() : body;
		}
	});

	t.is(rest.length, 1);
	t.is(res.statusCode, 200);
	t.is(res.hrefs.length, 1);
	t.is(res.hrefs[0], 'http://a.domain.com');
	t.false(notImportant.isDone());
});

test('transformHtml option (promise version)', async t => {
	t.plan(5);

	nock('http://yetanother.domain.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<main>
						<a href="http://a.domain.com">Hello world!</a>
					</main>
					<aside>
						<a href="http://not-important.com">Not important</a>
					</aside>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const notImportant = nock('http://not-important.com')
		.get('/')
		.reply(404);

	const [res, ...rest] = await spindel('http://yetanother.domain.com', {
		transformHtml(body) {
			return new Promise(resolve => {
				const $ = cheerio.load(body);
				const main = $('main');
				resolve(main.length ? main.html() : body);
			});
		}
	});

	t.is(rest.length, 1);
	t.is(res.statusCode, 200);
	t.is(res.hrefs.length, 1);
	t.is(res.hrefs[0], 'http://a.domain.com');
	t.false(notImportant.isDone());
});

test('custom queue (promise version)', async t => {
	t.plan(4);

	const example = nock('http://example.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<a href="http://another.domain.com">Link</a>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const queue = {
		urls: ['http://example.com'],
		popUrl() {
			return Promise.resolve(queue.urls.pop());
		},
		pushUrl() {
			// don't add any urls...
			return Promise.resolve();
		}
	};

	const [res, ...rest] = await spindel(queue);

	t.true(example.isDone());
	t.is(rest.length, 0);
	t.is(res.url, 'http://example.com');
	t.same(res.hrefs, ['http://another.domain.com']);
});

test('custom queue (sync version)', async t => {
	t.plan(4);

	const example = nock('http://example.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					<a href="http://another.domain.com">Link</a>
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const queue = {
		urls: ['http://example.com'],
		popUrl() {
			return queue.urls.pop();
		},
		pushUrl() {
			// don't add any urls...
			return;
		}
	};

	const [res, ...rest] = await spindel(queue);

	t.true(example.isDone());
	t.is(rest.length, 0);
	t.is(res.url, 'http://example.com');
	t.same(res.hrefs, ['http://another.domain.com']);
});

test('non strings in initial url array', t => {
	t.plan(1);

	t.throws(spindel([{bad: true}]), 'A url must be a string!');
});

test('non strings in custom queue', t => {
	t.plan(1);

	const queue = {
		urls: [{bad: true}],
		popUrl() {
			return Promise.resolve(queue.urls.pop());
		},
		pushUrl(url) {
			queue.urls.push(url);
			return Promise.resolve();
		}
	};

	t.throws(spindel(queue), 'A url must be a string!');
});

test('incomplete queue implementation', t => {
	t.plan(1);

	const queue = {
		urls: ['http://example.com'],
		shiftUrl() {
			return Promise.resolve(queue.urls.pop());
		},
		pushUrl(url) {
			queue.urls.push(url);
			return Promise.resolve();
		}
	};

	t.throws(spindel(queue), 'A queue must implement `pushUrl` and `popUrl`!');
});

test('bad queue implementation', t => {
	t.plan(1);

	const queue = {
		urls: ['http://example.com'],
		popUrl() {
			throw new Error('Ooops!');
		},
		pushUrl(url) {
			queue.urls.push(url);
			return Promise.resolve();
		}
	};

	t.throws(spindel(queue), 'Ooops!');
});

test('custom queue utilizing lastUrl param', async t => {
	t.plan(7);

	const examples = nock('http://examples.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					Lorem ipsum
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});
	const more = nock('http://more.examples.com')
		.get('/')
		.reply(200, `
			<html>
				<body>
					Dolor sit amet
				</body>
			</html>
		`, {
			'Content-Type': 'text/html'
		});

	const queue = {
		popUrl(lastUrl) {
			if (!lastUrl) {
				return 'http://examples.com';
			} else if (lastUrl === 'http://examples.com') {
				return 'http://more.examples.com';
			}
		},
		pushUrl() {
			return Promise.resolve();
		}
	};

	const [examplesRes, moreRes, ...rest] = await spindel(queue);

	t.true(examples.isDone());
	t.true(more.isDone());
	t.is(rest.length, 0);
	t.is(examplesRes.url, 'http://examples.com');
	t.is(examplesRes.hrefs.length, 0);
	t.is(moreRes.url, 'http://more.examples.com');
	t.is(moreRes.hrefs.length, 0);
});
