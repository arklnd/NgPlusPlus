/**
 * Utility for finding caller details using structured stack trace
 */

type CallSite = {
  getThis(): unknown;
  getTypeName(): string | null;
  getFunction(): Function | undefined;
  getFunctionName(): string | null;
  getMethodName(): string | null;
  getFileName(): string | null;
  getLineNumber(): number | null;
  getColumnNumber(): number | null;
  getEvalOrigin(): string | undefined;
  isToplevel(): boolean;
  isEval(): boolean;
  isNative(): boolean;
  isConstructor(): boolean;
};

export interface CallerDetails {
  functionName?: string | null;
  methodName?: string | null;
  fileName?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
}

/**
 * Gets the details of the function that called the current function
 * @param skipFrames Number of extra frames to skip beyond getCallerDetails + the current function
 * @returns CallerDetails object or null if unable to determine
 */
export function getCallerDetails(skipFrames = 0): CallerDetails | null {
  const origPrepare = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (err, structuredStack) => structuredStack;
    const err = new Error();
    // Generate the stack
    const stack = err.stack as unknown as CallSite[];

    // Frame 0: getCallerDetails
    // Frame 1: the function that called getCallerDetails
    // Frame 2: its caller (what you usually want)
    const targetIndex = 2 + skipFrames;
    const cs = stack?.[targetIndex];
    if (!cs) return null;

    return {
      functionName: cs.getFunctionName(),
      methodName: cs.getMethodName(),
      fileName: cs.getFileName(),
      lineNumber: cs.getLineNumber(),
      columnNumber: cs.getColumnNumber(),
    };
  } finally {
    // Restore original behavior
    Error.prepareStackTrace = origPrepare;
  }
}

/**
 * Gets the call stack details up to a specified depth
 * @param depth Maximum number of stack frames to return (excluding this function)
 * @param skipFrames Number of extra frames to skip beyond getCallStack + the current function
 * @returns Array of CallerDetails
 */
export function getCallStack(depth: number = 5, skipFrames = 0): CallerDetails[] {
  const origPrepare = Error.prepareStackTrace;

  try {
    Error.prepareStackTrace = (err, structuredStack) => structuredStack;
    const err = new Error();
    const stack = err.stack as unknown as CallSite[];

    const result: CallerDetails[] = [];
    const startIndex = 2 + skipFrames; // Skip getCallStack and its caller

    for (let i = startIndex; i < stack.length && result.length < depth; i++) {
      const cs = stack[i];
      result.push({
        functionName: cs.getFunctionName(),
        methodName: cs.getMethodName(),
        fileName: cs.getFileName(),
        lineNumber: cs.getLineNumber(),
        columnNumber: cs.getColumnNumber(),
      });
    }

    return result;
  } finally {
    Error.prepareStackTrace = origPrepare;
  }
}