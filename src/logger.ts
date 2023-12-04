import initLogger from 'pino';

export const logger = initLogger({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});
