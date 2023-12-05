import 'dotenv/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { CustomFile } from 'telegram/client/uploads';
import * as cache from './cache';
import { SeasonEnum, TimesOfDayEnum } from './enums';
import { logger } from './logger';
import { differenceInDays, differenceInMilliseconds } from 'date-fns';

const apiId = Number(process.env.APP_ID as string);
const apiHash = process.env.APP_HASH as string;
const IMAGE_TO_UPLOAD_NAME = 'upload.png';

function getFileFromAssetsFolder(fileName: string) {
  return path.join(process.cwd(), 'assets', fileName);
}

(async () => {
  cache.init();

  const client = await auth();

  // uploadAvatarOncePerSecond(client);

  uploadAvatarForNewYearCountdown(client);
})();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function uploadAvatarOncePerSecond(client: TelegramClient) {
  try {
    await generateImageWithCurrentTime();
    updateAvatar(client);
  } catch (e) {
    logger.error(e);
  }

  const timeout = 60000 - new Date().getSeconds() * 1000;
  logger.info(`Next update in ${timeout}ms`);
  setTimeout(() => {
    uploadAvatarOncePerSecond(client);
  }, timeout);
}

async function uploadAvatarForNewYearCountdown(client: TelegramClient) {
  try {
    await generateImageWithNewYearCountdown();
    updateAvatar(client);
  } catch (e) {
    logger.error(e);
  }

  const currDate = new Date();

  const updateHours = [0, 9, 17, 21];

  const isEndOfDay = !updateHours.find((h) => h > currDate.getHours());
  const timeout = Math.abs(
    differenceInMilliseconds(
      currDate,
      new Date(
        currDate.getFullYear(),
        currDate.getMonth(),
        currDate.getDate() + (isEndOfDay ? 1 : 0),
        updateHours.find((h) => h > currDate.getHours()) || updateHours[0]
      )
    )
  );

  logger.info(`Next update in ${timeout}ms`);
  setTimeout(() => {
    uploadAvatarForNewYearCountdown(client);
  }, timeout);
}

async function updateAvatar(client: TelegramClient) {
  logger.info('Updating avatar...');
  const avatar = await client.invoke(
    new Api.photos.UploadProfilePhoto({
      file: await client.uploadFile({
        file: new CustomFile(
          IMAGE_TO_UPLOAD_NAME,
          (await fs.stat(getFileFromAssetsFolder(IMAGE_TO_UPLOAD_NAME))).size,
          getFileFromAssetsFolder(IMAGE_TO_UPLOAD_NAME)
        ),
        workers: 2,
      }),
    })
  );

  logger.info('Avatar updated');

  const cachedLastUploadedId = cache.get('lastUploadedAvatarId');
  if (cachedLastUploadedId) {
    logger.info('Removing old profile photo');
    const username = ((await client.getMe(false)) as Api.User).username;
    const userPhotos = (await client.invoke(new Api.photos.GetUserPhotos({ userId: username }))).photos;

    const photoToDelete = userPhotos.find(({ id }) => id.equals(BigInt(cachedLastUploadedId)));

    // @ts-ignore
    photoToDelete && (await client.invoke(new Api.photos.DeletePhotos({ id: [photoToDelete] })));

    logger.info('Old profile photo deleted');
  }

  cache.set('lastUploadedAvatarId', avatar.photo.id.toString());
}

async function auth() {
  let stringSession: StringSession;
  try {
    stringSession = new StringSession(cache.get('session'));
  } catch (e) {
    stringSession = new StringSession(''); // fill this later with the value from session.save()
  }

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () =>
      (await inquirer.prompt({ type: 'input', name: 'phoneNumber', message: 'Enter phone number:' })).phoneNumber,
    password: async () =>
      (await inquirer.prompt({ type: 'password', name: 'password', message: 'Enter password:' })).password,
    phoneCode: async () => (await inquirer.prompt({ type: 'input', name: 'code', message: 'Enter code:' })).code,
    onError: (err) => logger.info(err),
  });
  logger.info('You should now be connected.');
  const session = client.session.save() as unknown as string; // Save this string to avoid logging in again

  cache.set('session', session);

  return client;
}

async function generateImageWithCurrentTime() {
  logger.info('Generating image with current time...');

  const IMAGE_WIDTH_HEIGHT = 1024;
  const FONT_SIZE = 150;

  const canvas = createCanvas(IMAGE_WIDTH_HEIGHT, IMAGE_WIDTH_HEIGHT);
  const ctx = canvas.getContext('2d');

  const imageByDayTime = {
    [TimesOfDayEnum.EVENING]: 'evening.png',
    [TimesOfDayEnum.DAY]: 'day.png',
    [TimesOfDayEnum.MORNING]: 'morning.png',
    [TimesOfDayEnum.NIGHT]: 'night.png',
  };

  const [time, timeOfDay, season] = getCurrentTimeAndTimeOfDayAndSeason();

  ctx.drawImage(await loadImage(getFileFromAssetsFolder(season + '/' + imageByDayTime[timeOfDay])), 0, 0);
  ctx.font = `bold ${FONT_SIZE}pt 'PT Sans'`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  const { width } = ctx.measureText(time);
  ctx.fillText(time, IMAGE_WIDTH_HEIGHT / 2 - width / 2, IMAGE_WIDTH_HEIGHT / 2 + FONT_SIZE / 2);

  await fs.writeFile(path.join(process.cwd(), `assets/${IMAGE_TO_UPLOAD_NAME}`), canvas.toBuffer('image/png'));

  logger.info('Image generated');
}

async function generateImageWithNewYearCountdown() {
  logger.info('Generating image with New Year countdown...');

  const currDate = new Date();
  const isNewYear =
    (currDate.getMonth() === 11 && currDate.getDate() === 31) ||
    (currDate.getMonth() === 0 && currDate.getDate() === 1);

  const IMAGE_WIDTH_HEIGHT = 1024;
  const FONT_SIZE = isNewYear ? 90 : 130;
  const SECONDARY_FONT_SIZE = 60;

  const canvas = createCanvas(IMAGE_WIDTH_HEIGHT, IMAGE_WIDTH_HEIGHT);
  const ctx = canvas.getContext('2d');

  const imageByDayTime = {
    [TimesOfDayEnum.EVENING]: 'evening.png',
    [TimesOfDayEnum.DAY]: 'day.png',
    [TimesOfDayEnum.MORNING]: 'morning.png',
    [TimesOfDayEnum.NIGHT]: 'night.png',
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, timeOfDay, season] = getCurrentTimeAndTimeOfDayAndSeason();
  const daysBeforeNewYear = getDaysNumberBeforeNewYear();

  const daysBeforeNewYearStr = !isNewYear ? `${daysBeforeNewYear} Days` : 'Happy New Year!';
  const secondaryText = 'until New Year';

  ctx.drawImage(
    await loadImage(getFileFromAssetsFolder(season + '/' + (isNewYear ? 'newyear.png' : imageByDayTime[timeOfDay]))),
    0,
    0
  );
  ctx.font = `bold ${FONT_SIZE}pt 'PT Sans'`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';

  const { width } = ctx.measureText(daysBeforeNewYearStr);

  ctx.fillText(daysBeforeNewYearStr, IMAGE_WIDTH_HEIGHT / 2 - width / 2, IMAGE_WIDTH_HEIGHT / 2 + FONT_SIZE / 2);

  ctx.font = `bold ${SECONDARY_FONT_SIZE}pt 'PT Sans'`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';

  const { width: secondaryTextWidth } = ctx.measureText(secondaryText);

  if (!isNewYear) {
    ctx.fillText(
      secondaryText,
      IMAGE_WIDTH_HEIGHT / 2 - secondaryTextWidth / 2,
      IMAGE_WIDTH_HEIGHT / 2 + FONT_SIZE + SECONDARY_FONT_SIZE / 2
    );
  }

  await fs.writeFile(path.join(process.cwd(), `assets/${IMAGE_TO_UPLOAD_NAME}`), canvas.toBuffer('image/png'));

  logger.info('Image generated');
}

function getDaysNumberBeforeNewYear() {
  const currDate = new Date();

  return Math.abs(differenceInDays(new Date(), new Date(currDate.getFullYear() + 1, 0)));
}

function getCurrentTimeAndTimeOfDayAndSeason(): [string, TimesOfDayEnum, string] {
  const date = new Date();

  const hours = date.getHours();

  const normalizeNumber = (num: number) => {
    if (num < 10) {
      return '0' + num;
    }

    return num;
  };

  const timeStr = `${normalizeNumber(hours)}:${normalizeNumber(date.getMinutes())}`;

  let timeOfDay = TimesOfDayEnum.EVENING;
  if (hours < 6 || hours > 20) {
    timeOfDay = TimesOfDayEnum.NIGHT;
  } else if (hours < 11) {
    timeOfDay = TimesOfDayEnum.MORNING;
  } else if (hours < 17) {
    timeOfDay = TimesOfDayEnum.DAY;
  }

  const season = date.getMonth() > 10 || date.getMonth() < 2 ? SeasonEnum.WINTER : SeasonEnum.SUMMER;

  logger.debug(timeOfDay, season);

  return [timeStr, timeOfDay, season];
}
