export const WakeLockService = {
    wakeLock: null as WakeLockSentinel | null,

    async request() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock active');
                this.wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock released');
                });
            } catch (err) {
                console.error(`Wake Lock error: ${err.name}, ${err.message}`);
            }
        }
    },

    async release() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }
};
