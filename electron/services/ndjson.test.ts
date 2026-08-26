import { describe, expect, it } from 'vitest'
import { NdjsonAccumulator, parseNdjsonLine } from './ndjson'

describe('NDJSON parsing', () => {
  it('parses a valid CLI envelope', () => {
    expect(
      parseNdjsonLine('{"code":0,"msg":"成功","action":"share","type":"result","data":{}}')
    ).toMatchObject({ code: 0, msg: '成功', action: 'share', type: 'result' })
  })

  it('handles chunk boundaries without dropping lines', () => {
    const parser = new NdjsonAccumulator()
    expect(parser.push('{"msg":"进行中","action":"upload",')).toHaveLength(0)
    const rows = parser.push('"type":"progress","data":{"percent":50}}\nplain log\n')
    expect(rows).toHaveLength(2)
    expect(rows[0].parsed?.data).toEqual({ percent: 50 })
    expect(rows[1].parsed).toBeNull()
  })
})
