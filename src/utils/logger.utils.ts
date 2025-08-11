import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4,
}

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    context?: string;
    metadata?: Record<string, any>;
}

export interface LoggerConfig {
    level: LogLevel;
    enableFileLogging: boolean;
    logDirectory: string;
    logFileName?: string;
    maxFileSize?: number; // in bytes
    maxFiles?: number;
    enableConsoleLogging: boolean;
}

/**
 * Simple file-based logger utility for NgPlusPlus MCP
 */
export class Logger {
    private config: LoggerConfig;
    private logFilePath: string;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            level: LogLevel.INFO,
            enableFileLogging: true,
            logDirectory: './logs',
            logFileName: `ngplusplus-${new Date().toLocaleString('en-IN', { 
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/[/,:]/g, '-').replace(/\s/g, '_')}.log`,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            enableConsoleLogging: true,
            ...config,
        };

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.config.logDirectory = path.join(__dirname, this.config.logDirectory);
        this.logFilePath = path.join(this.config.logDirectory, this.config.logFileName!);
        this.ensureLogDirectory();
    }

    /**
     * Ensure log directory exists
     */
    private ensureLogDirectory(): void {
        if (this.config.enableFileLogging && !fs.existsSync(this.config.logDirectory)) {
            fs.mkdirSync(this.config.logDirectory, { recursive: true });
        }
    }

    /**
     * Check if log file needs rotation based on size
     */
    private checkAndRotateLog(): void {
        if (!this.config.enableFileLogging) return;

        try {
            if (fs.existsSync(this.logFilePath)) {
                const stats = fs.statSync(this.logFilePath);
                if (stats.size > this.config.maxFileSize!) {
                    this.rotateLogFile();
                }
            }
        } catch (error) {
            // If we can't check the file, just continue
        }
    }

    /**
     * Rotate log files when they get too large
     */
    private rotateLogFile(): void {
        try {
            const baseName = path.basename(this.config.logFileName!, '.log');
            const extension = path.extname(this.config.logFileName!);

            // Move existing log files
            for (let i = this.config.maxFiles! - 1; i >= 1; i--) {
                const oldFile = path.join(this.config.logDirectory, `${baseName}.${i}${extension}`);
                const newFile = path.join(this.config.logDirectory, `${baseName}.${i + 1}${extension}`);

                if (fs.existsSync(oldFile)) {
                    if (i === this.config.maxFiles! - 1) {
                        // Delete the oldest file
                        fs.unlinkSync(oldFile);
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }

            // Move current log file to .1
            const rotatedFile = path.join(this.config.logDirectory, `${baseName}.1${extension}`);
            fs.renameSync(this.logFilePath, rotatedFile);
        } catch (error) {
            // If rotation fails, just continue
        }
    }

    /**
     * Format log entry
     */
    private formatLogEntry(level: string, message: string, context?: string, metadata?: Record<string, any>): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';

        return `${timestamp} [${level.toUpperCase()}]${contextStr} ${message}${metadataStr}`;
    }

    /**
     * Write log entry to file
     */
    private writeToFile(logEntry: string): void {
        if (!this.config.enableFileLogging) return;

        try {
            this.checkAndRotateLog();
            fs.appendFileSync(this.logFilePath, logEntry + '\n', 'utf8');
        } catch (error) {
            // If file logging fails, output to console error as fallback
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Write log entry to console
     */
    private writeToConsole(level: string, message: string, context?: string, metadata?: Record<string, any>): void {
        if (!this.config.enableConsoleLogging) return;

        const contextStr = context ? ` [${context}]` : '';
        const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
        const fullMessage = `${message}${contextStr}${metadataStr}`;

        switch (level.toLowerCase()) {
            case 'error':
                console.error(fullMessage);
                break;
            case 'warn':
                console.warn(fullMessage);
                break;
            case 'debug':
            case 'trace':
                console.debug(fullMessage);
                break;
            default:
                console.log(fullMessage);
        }
    }

    /**
     * Generic log method
     */
    private log(level: LogLevel, levelName: string, message: string, context?: string, metadata?: Record<string, any>): void {
        if (level > this.config.level) return;

        const logEntry = this.formatLogEntry(levelName, message, context, metadata);

        this.writeToFile(logEntry);
        this.writeToConsole(levelName, message, context, metadata);
    }

    /**
     * Log error message
     */
    error(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.ERROR, 'ERROR', message, context, metadata);
    }

    /**
     * Log warning message
     */
    warn(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.WARN, 'WARN', message, context, metadata);
    }

    /**
     * Log info message
     */
    info(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.INFO, 'INFO', message, context, metadata);
    }

    /**
     * Log debug message
     */
    debug(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, context, metadata);
    }

    /**
     * Log trace message
     */
    trace(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.TRACE, 'TRACE', message, context, metadata);
    }

    /**
     * Create a child logger with a specific context
     */
    child(context: string): ChildLogger {
        return new ChildLogger(this, context);
    }

    /**
     * Set log level
     */
    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    /**
     * Get current log file path
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    /**
     * Get logger configuration
     */
    getConfig(): LoggerConfig {
        return { ...this.config };
    }
}

/**
 * Child logger that automatically includes context
 */
export class ChildLogger {
    constructor(private parent: Logger, private context: string) {}

    error(message: string, metadata?: Record<string, any>): void {
        this.parent.error(message, this.context, metadata);
    }

    warn(message: string, metadata?: Record<string, any>): void {
        this.parent.warn(message, this.context, metadata);
    }

    info(message: string, metadata?: Record<string, any>): void {
        this.parent.info(message, this.context, metadata);
    }

    debug(message: string, metadata?: Record<string, any>): void {
        this.parent.debug(message, this.context, metadata);
    }

    trace(message: string, metadata?: Record<string, any>): void {
        this.parent.trace(message, this.context, metadata);
    }

    child(subContext: string): ChildLogger {
        return new ChildLogger(this.parent, `${this.context}:${subContext}`);
    }
}

// Default logger instance
let defaultLogger: Logger | null = null;

/**
 * Get or create the default logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
    if (!defaultLogger) {
        defaultLogger = new Logger(config);
    }
    return defaultLogger;
}

/**
 * Initialize logger with specific configuration
 */
export function initializeLogger(config: Partial<LoggerConfig>): Logger {
    defaultLogger = new Logger(config);
    return defaultLogger;
}

/**
 * Create a new logger instance (not the default one)
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
    return new Logger(config);
}
