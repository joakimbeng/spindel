# spindel

[![Build status][travis-image]][travis-url] [![NPM version][npm-image]][npm-url] [![XO code style][codestyle-image]][codestyle-url]

> A web crawler/spider

"spindel" is the Swedish word for spider.

## Installation

Install `spindel` using [npm](https://www.npmjs.com/):

```bash
npm install --save spindel
```

## Usage

### Module usage

#### Start with single url

```javascript
const spindel = require('spindel');

// Start a crawler at http://example.com:
const stream = spindel('http://example.com');

stream.on('data', res => {
	// see response object format below
});
```

#### Start with multiple urls

```javascript
// Start a crawler with an initial queue consisting of two urls:
const stream = spindel([
	'http://example.com',
	'http://another.com'
]);

stream.on('data', res => {
	// see response object format below
});
```

#### Use a database as url queue

```javascript
// Start a crawler with a custom queue:
const redisQueue = {
	popUrl() {
		return getNextUrlFromRedisAndReturnAPromise();
	},
	pushUrl(url) {
		return pushUrlToRedisAndReturnAPromise(url);
	}
};
const stream = spindel(redisQueue);

stream.on('data', res => {
	// see response object format below
});
```

## API

### `spindel(urlsOrQueue, options)`

| Name | Type | Description |
|------|------|-------------|
| urlsOrQueue | `String`, `Array` or `Object` | A single url, an array of urls or a [queue implementation](#queue-implementation) |
| options | `Object` | The [options](#options) object |

**Returns:** [`stream.Readable`](https://nodejs.org/api/stream.html#stream_class_stream_readable) which emits [response objects](#streamed-response-objects) on the `'data'` event.


#### Options

##### `options.transformHtml`

**Type:** `Function`  
**Default:** `noop`

**Params:**

| Name | Type | Description |
|------|------|-------------|
| body | `String` | The response body |
| url | `String` | The url for the page being crawled
| res | `Object` | The full [response](https://nodejs.org/api/http.html#http_class_http_incomingmessage) object |

**Return value:** `Any` or `Promise<Any>`.

For responses containing HTML (i.e. having a content-type which begins with `text/` and ends with `html`) this function will be run and its return value will be set to `transformedHtml` in the [response object](#streamed-response-objects).


##### `options.gotOptions`

**Type:** `Object`  
**Default:** `{}`

Options passed to [`got`](https://github.com/sindresorhus/got#options).


#### Streamed response objects

A response object has the format:

```javascript
{
	url: String, // the crawled url
	statusCode: Number, // the HTTP status code
	statusMessage: String, // the HTTP status message
	body: String, // the response body
	headers: Object, // the HTTP response headers
	hrefs: Array(String), // found <a href /> urls in the body if content is HTML
	transformedHtml: String // if content is HTML this contains the `body` after applying the `transformHtml` option function
}
```


#### Queue implementation

A queue implementation consists of two functions `popUrl` and `pushUrl`.


##### `queue.popUrl`

**Type:** `function`

**Params:**

| Name | Type | Description |
|------|------|-------------|
| lastUrl | `String` | The last crawled url, or `null` for the first url |

**Should return:** `String` or `Promise<String>` to continue crawling or `null` or `Promise<null>` to stop crawling.


##### `queue.pushUrl`

**Type:** `function`

**Params:**

| Name | Type | Description |
|------|------|-------------|
| href | `String` | A found href in the currently crawled response body |
| referral | `String` | The url for the current crawl |

**Should return:** nothing or `Promise`.


##### Example of the internal ArrayQueue

```javascript
function arrayQueue(initialUrls) {
	const urls = initialUrls.slice();

	return {
		pushUrl(url) {
			urls.push(url);
		},
		popUrl() {
			return urls.pop();
		}
	};
}
```

The queue implementation above is used if spindel's `urlsOrQueue` parameter is a `String` or `Array`.

## License

MIT © [Joakim Carlstein](http://joakim.beng.se/)

[npm-url]: https://npmjs.org/package/spindel
[npm-image]: https://badge.fury.io/js/spindel.svg
[travis-url]: https://travis-ci.org/joakimbeng/spindel
[travis-image]: https://travis-ci.org/joakimbeng/spindel.svg?branch=master
[codestyle-url]: https://github.com/sindresorhus/xo
[codestyle-image]: https://img.shields.io/badge/code%20style-XO-5ed9c7.svg?style=flat
