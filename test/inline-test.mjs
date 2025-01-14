/* eslint-env mocha */
'use strict'

import { expect, makeTests, resolveDirname, scanTests, stringifyASG } from '#test-harness'
import parse from 'asciidoc-parsing-lab'
import { parse as parseInline } from '#inline-parser'
import ospath from 'node:path'

const tests = await scanTests(ospath.join(resolveDirname(import.meta), 'tests/inline'))

describe('inline', () => {
  makeTests(tests, ({ input, inputPath, expected, expectedWithoutLocations }) => {
    //const actual = parse(input, { parseInlines: true }).blocks[0].inlines
    const actual = parseInline(input)
    if (expected == null) {
      // Q: can we write data to expected file automatically?
      // TODO only output expected if environment variable is set
      console.log(stringifyASG(actual))
    } else {
      const msg = `actual output does not match expected output for ${inputPath}`
      expect(actual, msg).to.eql(!actual.length || 'location' in actual[0] ? expected : expectedWithoutLocations)
    }
  })

  it('empty input', () => {
    expect(parseInline('')).to.eql([])
  })
})
