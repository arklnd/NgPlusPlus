export interface LoggerConfig {
    level: LogLevel;
    enableFileLogging: boolean;
    logDirectory: string;
    logFileName?: string;
    maxFileSize?: number; // in bytes
    maxFiles?: number;
    enableConsoleLogging: boolean;
}

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4,
}
