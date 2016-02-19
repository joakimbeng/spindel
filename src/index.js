'use strict';
const util = require('util');
const stream = require('stream');
const arrify = require('arrify');
const got = require('got');
const getHrefs = require('get-hrefs');
const promiseReduce = require('promise-reduce');

const IGNORE = {code: 'EIGNORE'};
const identity = val => val;

function Spindel(queue, opts) {
	opts = opts || {};

	stream.Readable.call(this, {objectMode: true});

	this.url = null;

	this.gotOptions = opts.gotOptions || {};

	this.queue = {
		pushUrl: queue.pushUrl,
		popUrl: queue.popUrl,
		pushAll: (urls, referral) => promiseReduce((_, url) => this.queue.pushUrl(url, referral))(urls)
	};

	this.transformHtml = (
		typeof opts.transformHtml === 'function' ?
		opts.transformHtml :
		identity
	);
}

util.inherits(Spindel, stream.Readable);

Spindel.prototype._read = function () {
	if (!isQueue(this.queue)) {
		this.emit('error', new Error('A queue must implement `pushUrl` and `popUrl`!'));
		return;
	}
	Promise.resolve()
		.then(() => this.queue.popUrl(this.url))
		.then(url => {
			if (url && typeof url !== 'string') {
				throw new Error('A url must be a string!');
			}
			if (!url) {
				return this.push(null);
			}
			this.url = url;
			return got(url, this.gotOptions)
				.catch(err => {
					this.push(gotErrorToResponseObject(err, url));
					throw IGNORE;
				})
				.then(res => {
					return Promise.resolve(
						isHtml(res.headers) ?
						this.transformHtml(res.body, url, res) :
						null
					)
					.then(transformedHtml => {
						const hrefs = transformedHtml ? getHrefs(transformedHtml) : [];
						return this.queue.pushAll(hrefs, url)
							.then(() => this.push({
								url,
								statusCode: res.statusCode,
								statusMessage: res.statusMessage,
								body: res.body,
								headers: res.headers,
								hrefs,
								transformedHtml
							}));
					});
				});
		})
		.catch(err => {
			if (err === IGNORE) {
				return;
			}
			this.emit('error', err);
		});
};

module.exports = exports = function spindel(urls, opts) {
	if (Array.isArray(urls) || typeof urls !== 'object') {
		urls = arrayQueue(arrify(urls));
	}

	return new Spindel(urls, opts);
};

function isQueue(obj) {
	return (
		typeof obj.pushUrl === 'function' &&
		typeof obj.popUrl === 'function'
	);
}

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

function isHtml(headers) {
	const contentType = headers['content-type'] || '';
	const parts = contentType.split(';');
	return /^text\/\w*html$/.test(parts[0].trim());
}

function gotErrorToResponseObject(err, url) {
	return {
		url,
		statusCode: err.statusCode || null,
		statusMessage: err.statusMessage || null,
		body: err.response && err.response.body,
		headers: err.response && err.response.headers,
		hrefs: [],
		transformedHtml: null,
		code: err.code,
		message: err.message
	};
}
