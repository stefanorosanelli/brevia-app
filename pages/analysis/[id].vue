<template>
    <main class="space-y-6">
        <h2 class="text-2xl md:text-3xl lg:text-4xl leading-tight font-bold">{{ menuItem?.title }}</h2>
        <div class="space-y-6 sm:space-y-8">
            <div v-html="menuItem?.description"></div>

            <div>
                <DropZone @file-change="file = $event"
                    :disabled="isBusy || jobsLeft == '0'" :accept-types="acceptTypes" ref="fileDrop"/>
            </div>

            <div class="flex flex-col sm:flex-row justify-between">
                <button class="w-full sm:w-auto px-8 py-2 sm:py-4 button"
                    :class="{'loading' : isBusy}"
                    :disabled="!file || isBusy || jobsLeft == '0'"
                    @click="submit">{{ $t('UPLOAD_AND_ANALYZE_FILE') }}</button>
                <button class="w-full sm:w-auto mt-4 sm:ml-6 sm:mt-0 px-8 py-2 sm:py-4 bg-red-900 button"
                    :class="{'hover:bg-red-700' : !resetDisabled}"
                    :disabled="resetDisabled" @click="reset">{{ $t('RESET') }}</button>
            </div>
            <div class="space-y-4" v-if="isDemo">
                <span class="grow text-lg">{{ $t('JOBS_LEFT') }}: {{ jobsLeft }}</span>
            </div>

            <div class="space-x-4" v-if="isDemo && jobsLeft == '0'">
                <p class="block p-8 bg-red-100 border border-red-400 rounded-lg text-lg whitespace-pre-line">
                    {{ $t('NO_MORE_ANALYSIS_JOBS') }}
                </p>
            </div>

            <hr class="border-neutral-300" v-if="jobData">
            <div class="space-y-4" v-if="jobData">
                <h2 class="text-xl leading-tight"><span class="block md:inline font-bold">{{ file.name }}</span> {{ $t('ANALYSIS') }} <span class="block md:inline font-bold">{{ jobStatus }}</span></h2>
            </div>
            <div class="space-y-4" v-if="jobData">
                <p class="text-xl leading-tight">{{ $t('ELAPSED_TIME') }}: {{ elapsedTime }}</p>
            </div>

            <hr class="border-neutral-300" v-if="result">
            <div class="space-y-4" v-if="result">
                <p class="block p-8 bg-slate-900 border border-slate-900 text-white rounded-lg text-lg whitespace-pre-line">{{ result.output }}</p>
            </div>
            <div class="space-y-2 text-center sm:text-left" v-if="result">
                <a class="w-full sm:w-auto px-8 py-2 sm:py-4 button" v-if="result.document_url"
                    :href="result.document_url" target="_blank">
                        <Icon name="ph:download-bold" class="mr-3 -translate-y-px text-xl" />
                        <span class="inline-block py-2">{{ $t('DOWNLOAD_ANALYSIS') }}</span>
                </a>
                <button class="w-full sm:w-auto px-8 py-2 sm:py-4 button" v-else
                    @click="downloadPdf">{{ $t('DOWNLOAD_ANALYSIS') }}</button>
            </div>

            <div class="space-y-4" v-if="error">
                <p class="block p-8 bg-red-900 border border-red-900 text-white rounded-lg text-lg whitespace-pre-line">{{ error }}</p>
            </div>
        </div>

    </main>
</template>

<script>
import { useStatesStore } from '~~/store/states';

const INTERVAL = 15000; // 15 seconds in ms

export default {
    data() {
        return {
            file: null,
            isBusy: false,
            result: null,
            jobId: null,
            jobData: null,
            jobName: null,
            pollingId: null,
            error: null,
            isDemo: false,
            jobsLeft: null,
            menuItem: {},
        }
    },

    created() {
        const store = useStatesStore();
        const link = this.$route.path;
        store.userAccess(link);
        this.menuItem = store.getMenuItem(link);
        const config = useRuntimeConfig();
        useHead({ title: `${this.menuItem?.title} | ${config.public.appName}`});
        this.jobName = this.menuItem?.title?.toLowerCase()?.replace(' ', '-') || 'analysis';
        const info = store.getJobInfo(this.jobName);
        this.jobId = info?.id || null;
        this.file = info?.file || null;
        this.startPolling();
        this.isBusy = !!this.jobId;
        this.isDemo = store.userHasRole('demo');
        this.updateJobsLeft();
    },

    computed: {
        jobStatus() {
            if (this.jobData?.completed) {
                return 'completed';
            }
            if (this.jobData?.locked_until) {
                return 'in progress';
            }

            return 'idle';
        },

        resetDisabled() {
            return !this.file || (this.isBusy && !this.pollingId);
        },

        acceptTypes() {
            return this.menuItem?.params?.accept || 'application/pdf';
        },

        elapsedTime() {
            const dt = Date.parse(this.jobData?.created + 'Z');
            const now = new Date().getTime();
            const seconds = Math.round((now - dt) / 1000);
            if (seconds < 60) {
                return `${seconds} sec`
            }
            const minutes = Math.round((now - dt) / 60000);

            return `${minutes} min`
        },
    },

    methods: {
        reset() {
            this.file = null;
            this.result = null;
            this.error = null;
            this.isBusy = false;
            this.clearJob();
            this.jobData = null;
            this.$refs.fileDrop.reset();
        },

        clearJob() {
            this.jobId = null;
            useStatesStore().setJobInfo(this.jobName, null);
            this.stopPolling();
        },

        startPolling() {
            if (!this.jobId) {
                return;
            }
            // read first after 1 sec, then every 15 sec
            setTimeout(() => this.readJobData(), 1000);
            this.pollingId = setInterval(() => this.readJobData(), INTERVAL);
        },

        stopPolling() {
            if (this.pollingId) {
                clearInterval(this.pollingId);
            }
            this.pollingId = null;
        },

        async updateJobsLeft() {
            if (!this.isDemo) {
                return;
            }
            const userId = useStatesStore().user.id;
            const query = `service=${this.menuItem?.params?.service || ''}&user_id=${userId}`
            try {
                const response = await fetch(`/api/brevia/service_usage?${query}`);
                const data = await response.json();
                const usage = data?.usage || 0;
                const left = Math.max(0, parseInt(useRuntimeConfig().public.demo.maxNumAnalysis) - parseInt(usage));
                this.jobsLeft = String(left);
            } catch (error) {
                console.log(error);
            }
        },

        async submit() {
            this.isBusy = true;
            this.result = null;
            this.error = null;
            this.jobId = null;
            this.jobData = null;
            let formData = new FormData();
            let payload = this.menuItem?.params?.payload || {}
            payload['file_name'] = this.file.name;
            if (this.isDemo) {
                payload['user_id'] = useStatesStore().user.id;
            }
            formData.append('service', this.menuItem?.params?.service || '');
            formData.append('payload', JSON.stringify(payload));
            formData.append('file', this.file);
            try {
                const data = await $fetch('/api/brevia/upload_analyze', {
                    method: 'POST',
                    body: formData,
                });

                if (data.error) {
                    this.isBusy = false;
                    this.error = `There has been an error\n${data.error}`;
                    console.log(data.error);
                } else {
                    this.jobId = data.job?.trim() || '';
                    useStatesStore().setJobInfo(this.jobName, {id: this.jobId, file: {name: this.file?.name}});
                    this.startPolling();
                }
            } catch (error) {
                this.error = error;
                console.log(error);
            }
        },

        downloadPdf() {
            const doc = this.$createPdf(this.result?.output || '');
            let date = new Date().toISOString().split('T')[0];
            const pdfTitle = `Analysis-${this.file?.name}-${date}.pdf`;
            doc.save(pdfTitle);
        },

        async readJobData() {
            if (!this.jobId) {
                return;
            }
            try {
                const data = await $fetch(`/api/brevia/jobs/${this.jobId}`);
                const err = data?.error || data.result?.error || null;
                if (err) {
                    this.isBusy = false;
                    this.error = `There has been an error\n${err}`;
                    console.log(err);
                    this.clearJob();
                } else {
                    this.jobData = data;
                    if (this.jobData?.completed) {
                        this.isBusy = false;
                        this.result = this.jobData?.result;
                        this.clearJob();
                        this.updateJobsLeft();
                    }
                }
            } catch (error) {
                this.error = error;
                console.log(error);
            }
        },
    }
}
</script>