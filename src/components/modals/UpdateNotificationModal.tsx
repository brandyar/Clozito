import React, { useEffect, useState } from 'react';
import { Download, Sparkles, X, RefreshCw, AlertCircle } from 'lucide-react';
import { onUpdateAvailable, downloadAndInstallUpdate, checkDesktopUpdate, AppUpdateInfo } from '../../utils/updater';
import { getCurrentAppVersion, APP_VERSION } from '../../utils/version';
import { isTauriEnvironment } from '../../storage';
import { useTranslation } from '../../i18n';
import { BRAND } from '../../config/brand';

export const UpdateNotificationModal: React.FC = () => {
  const { locale } = useTranslation();
  const isIt = locale === 'it';
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [currentAppVer, setCurrentAppVer] = useState<string>(APP_VERSION);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentAppVersion().then(setCurrentAppVer);

    // Subscribe to update events
    const unsubscribe = onUpdateAvailable((info) => {
      if (info.available) {
        setUpdateInfo(info);
        setIsOpen(true);
      }
    });

    // Auto check after 3 seconds on desktop launch
    if (isTauriEnvironment()) {
      const timer = setTimeout(() => {
        checkDesktopUpdate().catch((e) => console.error('[AutoUpdateCheck] Error:', e));
      }, 3000);
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    }

    return () => {
      unsubscribe();
    };
  }, []);

  if (!isOpen || !updateInfo) return null;

  const handleStartUpdate = async () => {
    try {
      setIsDownloading(true);
      setInstallError(null);
      setStatusText(isIt ? 'Connessione e download del pacchetto di aggiornamento...' : 'Connecting and downloading update package...');

      await downloadAndInstallUpdate(updateInfo.updateObj, (downloaded, total) => {
        if (total > 0) {
          const percent = Math.round((downloaded / total) * 100);
          setDownloadProgress(percent);
          setStatusText(
            isIt
              ? `Download in corso: ${percent}% (${(downloaded / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB)`
              : `Downloading: ${percent}% (${(downloaded / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB)`
          );
        } else {
          setStatusText(
            isIt
              ? `Download in corso... (${(downloaded / (1024 * 1024)).toFixed(1)} MB)`
              : `Downloading... (${(downloaded / (1024 * 1024)).toFixed(1)} MB)`
          );
        }
      });

      setStatusText(isIt ? 'Download completato. Installazione e riavvio dell’app...' : 'Download complete. Installing and restarting...');
    } catch (err: any) {
      console.error('Update install error:', err);
      setIsDownloading(false);
      setInstallError(err?.message || (isIt ? 'Errore di connessione o installazione dell’aggiornamento' : 'Failed to connect or install update'));
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 shrink-0">
              <Sparkles className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-neutral-900 dark:text-white">
                  {isIt ? `Nuova versione di ${BRAND.name} disponibile` : `New ${BRAND.name} Update Ready`}
                </h3>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-mono">
                  v{updateInfo.version}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                {isIt ? 'Versione attuale:' : 'Current version:'} v{updateInfo.currentVersion || currentAppVer}
              </p>
            </div>
          </div>
          {!isDownloading && (
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Release Notes */}
        {updateInfo.body && (
          <div className="mt-5 rounded-xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isIt ? 'Novità di questa versione:' : "What's new in this release:"}
            </p>
            <div className="max-h-36 overflow-y-auto text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-line leading-relaxed pe-1">
              {updateInfo.body}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {installError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs dark:bg-red-950/40 dark:border-red-900 dark:text-red-400 space-y-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{isIt ? 'Errore di installazione:' : 'Update error:'} {installError}</span>
            </div>
            <div className="pt-1 flex items-center justify-end">
              <a
                href={BRAND.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                {isIt ? `Scarica direttamente l’installer ${BRAND.name}` : `Download ${BRAND.name} installer directly`}
              </a>
            </div>
          </div>
        )}

        {/* Download Progress Bar */}
        {isDownloading && (
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <span>{statusText}</span>
              {downloadProgress > 0 && <span className="font-mono">{downloadProgress}%</span>}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full bg-indigo-600 transition-all duration-300 dark:bg-indigo-500 rounded-full"
                style={{ width: `${Math.max(5, downloadProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3">
          {!isDownloading ? (
            <>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {isIt ? 'Ricordamelo più tardi' : 'Remind Me Later'}
              </button>
              <button
                onClick={handleStartUpdate}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                {isIt ? 'Scarica e Installa' : 'Download & Install'}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {isIt ? 'Attendere il completamento dell’installazione...' : 'Please wait while the update installs...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
