/* eslint-env mocha */
'use strict'

const { expect } = require('chai')
const fsp = require('node:fs/promises')
const ospath = require('node:path')
const { fileURLToPath } = require('node:url')
const yaml = require('js-yaml')

function heredoc (strings, ...values) {
  const first = strings[0]
  if (first[0] !== '\n') {
    return values.length ? values.reduce((accum, value, idx) => accum + value + strings[idx + 1], first) : first
  }
  let string = values.length
    ? (strings = strings.slice()).push(strings.pop().trimEnd()) &&
      values.reduce((accum, _, idx) => accum + '\x1f' + strings[idx + 1], first.slice(1))
    : first.slice(1).trimEnd()
  const lines = string.split('\n')
  const indentSize = lines.reduce(
    (accum, line) =>
      accum && line ? (line[0] === ' ' ? Math.min(accum, line.length - line.trimStart().length) : 0) : accum,
    Infinity
  )
  if (indentSize) {
    string = lines.map((line) => (line && line[0] === ' ' ? line.slice(indentSize) : line)).join('\n')
    if (!values.length) return string
    strings = string.split('\x1f')
  } else if (!values.length) {
    return string
  }
  return values.reduce((accum, value, idx) => accum + value + strings[idx + 1], strings[0])
}

function resolveDirname ({ url }) {
  return ospath.dirname(fileURLToPath(url))
}

function makeTests (tests, testBlock) {
  for (const test of tests) {
    const { name, type } = test
    if (type === 'dir') {
      describe(name, () => makeTests(test.entries, testBlock))
    } else {
      const testMethod = it[test.status] || it
      testMethod(name, () => testBlock(test))
    }
  }
}

async function scanTests (dir = process.cwd(), base = process.cwd()) {
  const entries = []
  if (!ospath.isAbsolute(dir)) dir = ospath.resolve(dir)
  for await (const dirent of await fsp.opendir(dir)) {
    const name = dirent.name
    if (dirent.isDirectory()) {
      const childEntries = await scanTests(ospath.join(dir, name), base)
      if (childEntries.length) entries.push({ type: 'dir', name, entries: childEntries })
    } else if (name.endsWith('-input.adoc')) {
      const basename = name.slice(0, name.length - 11)
      const inputPath = ospath.join(dir, name)
      const outputPath = ospath.join(dir, basename + '-output.json')
      const configPath = ospath.join(dir, basename + '-config.yml')
      entries.push(
        await Promise.all([
          fsp.readFile(inputPath, 'utf8'),
          fsp.readFile(outputPath).then(
            (data) => [JSON.parse(data), JSON.parse(data, (key, val) => key === 'location' ? undefined : val)],
            () => []
          ),
          fsp.readFile(configPath).then(yaml.load, () => Object.create(Object.prototype)),
        ]).then(([input, [expected, expectedWithoutLocations], config]) => {
          if (config.trim_trailing_whitespace) {
            input = input.trimEnd()
          } else if (config.ensure_trailing_newline) {
            if (input[input.length - 1] !== '\n') input += '\n'
          } else if (input[input.length - 1] === '\n') {
            input = input.slice(0, input.length - 1)
          }
          return {
            type: 'test',
            basename,
            name: config.name || basename.replace(/-/g, ' '),
            inputPath: ospath.relative(base, inputPath),
            outputPath: ospath.relative(base, outputPath),
            input,
            expected,
            expectedWithoutLocations,
            status: config.only ? 'only' : config.skip ? 'skip' : undefined,
          }
        })
      )
    }
  }
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'test' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function stringifyASG (asg) {
  const locations = []
  return JSON
    .stringify(asg, (key, val) => key === 'location' ? locations.push(val) - 1 : val, 2)
    .replace(/("location": )(\d+)/g, (_, key, idx) => {
      return key + JSON.stringify(locations[Number(idx)], null, 2).replace(/\n */g, ' ')
    })
}

module.exports = { expect, heredoc, resolveDirname, scanTests, makeTests, stringifyASG }
