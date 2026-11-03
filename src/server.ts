import { env } from './config/env.js';
import { createApp } from './app.js';
import { startScheduler } from './jobs/scheduler.js';

createApp().listen(env.PORT, () => {
  console.log(`HRMS API listening on http://localhost:${env.PORT}`);
});
startScheduler();
