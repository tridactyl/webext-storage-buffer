// TODO:
// - provide an interface for calling from content scripts

let buffers = {}
let waiting = {}

// Promise resolvers waiting to have a storage.set call
let resolversBeforeSet = {}

// Promise resolvers that have had a storage.set and are waiting for it to change the storage
let resolversAwaitingSet = {}

for (let area of ["sync", "local", "managed"]) {
    buffers[area] = {}
    waiting[area] = false
    resolversBeforeSet[area] = []
    resolversAwaitingSet[area] = []
}

// Buffered storage setter
// NB: it is unwise to `await` this as it will prevent the buffer from being used.
// If making many calls to `set` at once, use `Promise.all`.
function set(item, area="sync"){
    buffers[area] = deepmerge(buffers[area], item)
    let r
    const p = new Promise(resolver => r = x => resolver(item))
    resolversBeforeSet[area].push(r)
    !waiting[area] && writeBuffer(undefined, area)
    return p
}

function writeBuffer(changes,areaName){
    if (((changes || {})["TRI_BUFFERED_WRITE"] || {}).newValue === true) {
        // Resolve promises that were waiting for the storage to change
        resolversAwaitingSet[areaName].forEach(r=>r())
        // Ensure that the next set of promises are resolved by this function next time it is called
        resolversAwaitingSet[areaName] = resolversBeforeSet[areaName]
    } else {
        // If storage wasn't changed because of this API
        // Add the next set of promises to those resolved by this function next time it is called
        resolversAwaitingSet[areaName].push(...resolversBeforeSet[areaName])
    }

    resolversBeforeSet[areaName] = []

    if (Object.entries(buffers[areaName]).length === 0){
        waiting[areaName] = false
        return
    }

    const bufCopy = Object.assign({},buffers[areaName])
    buffers[areaName] = {}
    browser.storage[areaName].set(deepmerge(bufCopy,{TRI_BUFFERED_WRITE: true}))
    waiting[areaName] = true
}

browser.storage.onChanged.addListener(writeBuffer) // Once storage has been written to, write the contents of the buffer to it

window.storageBuffer = {
    set,
    writeBuffer,
    waiting,
    buffers,
    waiting,
    resolversBeforeSet,
}

// Benchmarking (use secret ctrl-b console for your sanity)
//
// // Wait for all sets to return at once
// base = performance.now(); p = []; for(let i = 0; i < 10000; i++){const a = {}; a[i] = i; p.push(storageBuffer.set(a,"sync"))}; Promise.all(p).then(x=>{const t = performance.now() - base; console.log("all ", t)})

// // Wait for each set to return before moving to next
// base2 = performance.now(); (async () => { let l; for(let i = 0; i < 10000; i++){const a = {}; a[i] = i; l = await storageBuffer.set(a,"sync")}; return l})().then(x=>{const t = performance.now() - base2; console.log("seq ", t)})
//
// sequential is apparently only ~5% slower than not O_o

// deepmerge - upstream URL: https://github.com/TehShrike/deepmerge/
// {{{
//
// The MIT License (MIT)
//
// Copyright (c) 2012 James Halliday, Josh Duff, and other contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// is-mergeable-object: https://github.com/TehShrike/is-mergeable-object
function isMergeableObject(value) {
	return isNonNullObject(value)
		&& !isSpecial(value)
}

function isNonNullObject(value) {
	return !!value && typeof value === 'object'
}

function isSpecial(value) {
	var stringValue = Object.prototype.toString.call(value)

	return stringValue === '[object RegExp]'
		|| stringValue === '[object Date]'
		|| isReactElement(value)
}

// see https://github.com/facebook/react/blob/b5ac963fb791d1298e7f396236383bc955f916c1/src/isomorphic/classic/element/ReactElement.js#L21-L25
var canUseSymbol = typeof Symbol === 'function' && Symbol.for
var REACT_ELEMENT_TYPE = canUseSymbol ? Symbol.for('react.element') : 0xeac7

function isReactElement(value) {
	return value.$$typeof === REACT_ELEMENT_TYPE
}

// deepmerge
var defaultIsMergeableObject = isMergeableObject

function emptyTarget(val) {
	return Array.isArray(val) ? [] : {}
}

function cloneUnlessOtherwiseSpecified(value, options) {
	return (options.clone !== false && options.isMergeableObject(value))
		? deepmerge(emptyTarget(value), value, options)
		: value
}

function defaultArrayMerge(target, source, options) {
	return target.concat(source).map(function(element) {
		return cloneUnlessOtherwiseSpecified(element, options)
	})
}

function getMergeFunction(key, options) {
	if (!options.customMerge) {
		return deepmerge
	}
	var customMerge = options.customMerge(key)
	return typeof customMerge === 'function' ? customMerge : deepmerge
}

function getEnumerableOwnPropertySymbols(target) {
	return Object.getOwnPropertySymbols
		? Object.getOwnPropertySymbols(target).filter(function(symbol) {
			return target.propertyIsEnumerable(symbol)
		})
		: []
}

function getKeys(target) {
	return Object.keys(target).concat(getEnumerableOwnPropertySymbols(target))
}

function propertyIsOnObject(object, property) {
	try {
		return property in object
	} catch(_) {
		return false
	}
}

// Protects from prototype poisoning and unexpected merging up the prototype chain.
function propertyIsUnsafe(target, key) {
	return propertyIsOnObject(target, key) // Properties are safe to merge if they don't exist in the target yet,
		&& !(Object.hasOwnProperty.call(target, key) // unsafe if they exist up the prototype chain,
			&& Object.propertyIsEnumerable.call(target, key)) // and also unsafe if they're nonenumerable.
}

function mergeObject(target, source, options) {
	var destination = {}
	if (options.isMergeableObject(target)) {
		getKeys(target).forEach(function(key) {
			destination[key] = cloneUnlessOtherwiseSpecified(target[key], options)
		})
	}
	getKeys(source).forEach(function(key) {
		if (propertyIsUnsafe(target, key)) {
			return
		}

		if (propertyIsOnObject(target, key) && options.isMergeableObject(source[key])) {
			destination[key] = getMergeFunction(key, options)(target[key], source[key], options)
		} else {
			destination[key] = cloneUnlessOtherwiseSpecified(source[key], options)
		}
	})
	return destination
}

function deepmerge(target, source, options) {
	options = options || {}
	options.arrayMerge = options.arrayMerge || defaultArrayMerge
	options.isMergeableObject = options.isMergeableObject || defaultIsMergeableObject
	// cloneUnlessOtherwiseSpecified is added to `options` so that custom arrayMerge()
	// implementations can use it. The caller may not replace it.
	options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified

	var sourceIsArray = Array.isArray(source)
	var targetIsArray = Array.isArray(target)
	var sourceAndTargetTypesMatch = sourceIsArray === targetIsArray

	if (!sourceAndTargetTypesMatch) {
		return cloneUnlessOtherwiseSpecified(source, options)
	} else if (sourceIsArray) {
		return options.arrayMerge(target, source, options)
	} else {
		return mergeObject(target, source, options)
	}
}

deepmerge.all = function deepmergeAll(array, options) {
	if (!Array.isArray(array)) {
		throw new Error('first argument should be an array')
	}

	return array.reduce(function(prev, next) {
		return deepmerge(prev, next, options)
	}, {})
}
// }}}
