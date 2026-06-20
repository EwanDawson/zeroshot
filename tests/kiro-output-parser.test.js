/**
 * Kiro helper parser tests.
 *
 * kiro-cli (--output-format json) emits a single final JSON object on stdout:
 * { response, tool_calls, stop_reason }.
 */

const assert = require('assert');
const { parseProviderChunk } = require('../src/providers');

describe('Kiro output parser facade', () => {
  it('emits text then result for a response-only object', () => {
    const line = JSON.stringify({
      response: 'Hello from kiro',
      tool_calls: [],
      stop_reason: 'end_turn',
    });
    assert.deepStrictEqual(parseProviderChunk('kiro', line), [
      { type: 'text', text: 'Hello from kiro' },
      { type: 'result', success: true, result: 'Hello from kiro', error: null },
    ]);
  });

  it('emits tool_call events before text and result, in array order', () => {
    const line = JSON.stringify({
      response: 'Done.',
      tool_calls: [
        { name: 'read_file', tool_call_id: 'tool-1', arguments: { path: 'a.txt' } },
        { name: 'write_file', tool_call_id: 'tool-2', arguments: { path: 'b.txt' } },
      ],
      stop_reason: 'end_turn',
    });
    assert.deepStrictEqual(parseProviderChunk('kiro', line), [
      { type: 'tool_call', toolName: 'read_file', toolId: 'tool-1', input: { path: 'a.txt' } },
      { type: 'tool_call', toolName: 'write_file', toolId: 'tool-2', input: { path: 'b.txt' } },
      { type: 'text', text: 'Done.' },
      { type: 'result', success: true, result: 'Done.', error: null },
    ]);
  });

  it('marks the result as failed when stop_reason is error', () => {
    const line = JSON.stringify({
      response: '',
      tool_calls: [],
      stop_reason: 'error',
      error: 'ThrottlingException: slow down',
    });
    assert.deepStrictEqual(parseProviderChunk('kiro', line), [
      {
        type: 'result',
        success: false,
        result: '',
        error: 'ThrottlingException: slow down',
      },
    ]);
  });

  it('falls back to a generic error message when stop_reason is error without detail', () => {
    const line = JSON.stringify({ response: '', tool_calls: [], stop_reason: 'error' });
    assert.deepStrictEqual(parseProviderChunk('kiro', line), [
      { type: 'result', success: false, result: '', error: 'kiro-cli returned an error' },
    ]);
  });

  it('ignores JSON lines that are not the kiro final object', () => {
    const line = JSON.stringify({ type: 'progress', detail: 'working' });
    assert.deepStrictEqual(parseProviderChunk('kiro', line), []);
  });

  it('supports tool-call key fallbacks (input/parameters and id)', () => {
    const inputFallback = JSON.stringify({
      response: 'ok',
      tool_calls: [{ tool_name: 'grep', id: 'call-9', input: { q: 'foo' } }],
      stop_reason: 'end_turn',
    });
    assert.deepStrictEqual(parseProviderChunk('kiro', inputFallback), [
      { type: 'tool_call', toolName: 'grep', toolId: 'call-9', input: { q: 'foo' } },
      { type: 'text', text: 'ok' },
      { type: 'result', success: true, result: 'ok', error: null },
    ]);

    const parametersFallback = JSON.stringify({
      response: 'ok',
      tool_calls: [{ name: 'grep', tool_id: 'call-10', parameters: { q: 'bar' } }],
      stop_reason: 'end_turn',
    });
    assert.deepStrictEqual(parseProviderChunk('kiro', parametersFallback), [
      { type: 'tool_call', toolName: 'grep', toolId: 'call-10', input: { q: 'bar' } },
      { type: 'text', text: 'ok' },
      { type: 'result', success: true, result: 'ok', error: null },
    ]);
  });
});
