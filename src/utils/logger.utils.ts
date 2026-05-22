import * as fs from 'fs';
import * as path from 'path';
import { LoggerConfig, LogLevel } from '@I/index';

/**
 * Logger utility for NgPlusPlus VS Code extension.
 * 
 * Supports two output backends:
 * 1. VS Code OutputChannel (primary in extension mode)
 * 2. File-based logging (fallback / additional persistence)
 * 
 * Console logging is disabled by default in extension mode since
 * VS Code extensions should use OutputChannel instead.
 */

/**
 * Abstraction for VS Code OutputChannel to avoid direct vscode import
 * in this utility file (vscode module is only available at runtime).
 */
export interface OutputChannelLike {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
}

export class Logger {
    private config: LoggerConfig;
    private logFilePath: string;
    private outputChannel: OutputChannelLike | null = null;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            level: LogLevel.TRACE,
            enableFileLogging: false,
            logDirectory: './logs',
            logFileName: (() => {
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                return `ngplusplus-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.log`;
            })(),
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            enableConsoleLogging: false,
            ...config,
        };

        this.logFilePath = path.join(this.config.logDirectory, this.config.logFileName!);

        if (this.config.enableFileLogging) {
            this.ensureLogDirectory();
        }
    }

    /**
     * Attach a VS Code OutputChannel for logging
     */
    setOutputChannel(channel: OutputChannelLike): void {
        this.outputChannel = channel;
    }

    /**
     * Get attached output channel
     */
    getOutputChannel(): OutputChannelLike | null {
        return this.outputChannel;
    }

    private ensureLogDirectory(): void {
        if (this.config.enableFileLogging && !fs.existsSync(this.config.logDirectory)) {
            fs.mkdirSync(this.config.logDirectory, { recursive: true });
        }
    }

    private checkAndRotateLog(): void {
        if (!this.config.enableFileLogging) return;
        try {
            if (fs.existsSync(this.logFilePath)) {
                const stats = fs.statSync(this.logFilePath);
                if (stats.size > this.config.maxFileSize!) {
                    this.rotateLogFile();
                }
            }
        } catch {
            // If we can't check the file, just continue
        }
    }

    private rotateLogFile(): void {
        try {
            const baseName = path.basename(this.config.logFileName!, '.log');
            const extension = path.extname(this.config.logFileName!);

            for (let i = this.config.maxFiles! - 1; i >= 1; i--) {
                const oldFile = path.join(this.config.logDirectory, `${baseName}.${i}${extension}`);
                const newFile = path.join(this.config.logDirectory, `${baseName}.${i + 1}${extension}`);

                if (fs.existsSync(oldFile)) {
                    if (i === this.config.maxFiles! - 1) {
                        fs.unlinkSync(oldFile);
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }

            const rotatedFile = path.join(this.config.logDirectory, `${baseName}.1${extension}`);
            fs.renameSync(this.logFilePath, rotatedFile);
        } catch {
            // If rotation fails, just continue
        }
    }

    private formatLogEntry(level: string, message: string, context?: string, metadata?: Record<string, any>): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` [${context}]` : '';
        const metadataStr = metadata
            ? ` ${Object.keys(metadata).length > 200 ? JSON.stringify(metadata, null, 1) : JSON.stringify(metadata)}`
            : '';

        return `${timestamp} ${level.toUpperCase()}${contextStr} ${message}${metadataStr}`;
    }

    private writeToFile(logEntry: string): void {
        if (!this.config.enableFileLogging) return;
        try {
            this.checkAndRotateLog();
            fs.appendFileSync(this.logFilePath, logEntry + '\n', 'utf8');
        } catch {
            // If file logging fails, swallow silently in extension context
        }
    }

    private writeToOutputChannel(level: string, message: string, context?: string, metadata?: Record<string, any>): void {
        if (!this.outputChannel) return;
        const entry = this.formatLogEntry(level, message, context, metadata);
        this.outputChannel.appendLine(entry);
    }

    private writeToConsole(level: string, message: string, context?: string, metadata?: Record<string, any>): void {
        if (!this.config.enableConsoleLogging) return;

        const contextStr = context ? `[${context}]` : '';
        const metadataStr = metadata
            ? ` ${JSON.stringify(metadata)}`
            : '';

        switch (level.toLowerCase()) {
            case 'error':
                console.error(`${contextStr} ${message}${metadataStr}`);
                break;
            case 'warn':
                console.warn(`${contextStr} ${message}${metadataStr}`);
                break;
            case 'debug':
            case 'trace':
                console.debug(`${contextStr} ${message}${metadataStr}`);
                break;
            default:
                console.log(`${contextStr} ${message}${metadataStr}`);
        }
    }

    private log(level: LogLevel, levelName: string, message: string, context?: string, metadata?: Record<string, any>): void {
        if (level > this.config.level) return;

        const logEntry = this.formatLogEntry(levelName, message, context, metadata);

        this.writeToFile(logEntry);
        this.writeToOutputChannel(levelName, message, context, metadata);
        this.writeToConsole(levelName, message, context, metadata);
    }

    error(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.ERROR, 'ERROR', message, context, metadata);
    }

    warn(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.WARN, 'WARN', message, context, metadata);
    }

    info(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.INFO, 'INFO', message, context, metadata);
    }

    debug(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, context, metadata);
    }

    trace(message: string, context?: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.TRACE, 'TRACE', message, context, metadata);
    }

    child(context: string): ChildLogger {
        return new ChildLogger(this, context);
    }

    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    getLogFilePath(): string {
        return this.logFilePath;
    }

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
