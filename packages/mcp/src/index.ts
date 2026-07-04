/** @ai-path/tb-mcp — expose a Taible grid to AI agents via a tool registry. */

export {
  createGridTools,
  formatValue,
  MAX_RANGE_CELLS,
  type GridTool,
} from './tools.js';
export { ToolDispatcher, type ToolCallResult } from './dispatcher.js';
