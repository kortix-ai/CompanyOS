'use client';

import { Download } from '@kortix/ui/internal/icons/download';

import { WALLPAPER_DOWNLOADS, type WallpaperDownload } from '@/lib/wallpaper-downloads';

import { DocPage, DocSection } from '../doc';

/**
 * The downloadable wallpapers and social avatars. Every wallpaper card reads
 * `WALLPAPER_DOWNLOADS`, which `scripts/generate-wallpapers.mjs` writes, so a
 * card can never offer a file that the script no longer produces.
 */
const MARK_WALLPAPERS = WALLPAPER_DOWNLOADS.filter((w) => w.group === 'mark');
const PRODUCT_WALLPAPERS = WALLPAPER_DOWNLOADS.filter((w) => w.group === 'product');

/** Square 1:1 profile pictures: the symbol centred on a solid field. */
const SOCIAL_ASSETS = [
  { id: 'social-black', variant: 'Black', src: '/brandkit/Profile Picture/Avatar Black.png' },
  { id: 'social-white', variant: 'White', src: '/brandkit/Profile Picture/Avatar White.png' },
] as const;

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3';

function formatBytes(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}

function wallpaperName(w: WallpaperDownload) {
  return w.id === 'brandmark' ? 'brandmark-bg' : w.name;
}

/** One wallpaper in one theme, with one download link per resolution. */
function WallpaperCard({ wallpaper }: { wallpaper: WallpaperDownload }) {
  const name = wallpaperName(wallpaper);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="border-border aspect-video overflow-hidden rounded-md border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={wallpaper.preview}
          alt={`Kortix ${name} wallpaper, ${wallpaper.theme}`}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium">{name}</span>
        <span className="text-muted-foreground font-mono text-xs capitalize">{wallpaper.theme}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {wallpaper.files.map((f) => (
          <a
            key={f.file}
            href={f.href}
            download={f.file}
            title={`${f.width}×${f.height} · ${formatBytes(f.bytes)}`}
            aria-label={`Download ${name} ${wallpaper.theme}, ${f.label} (${f.width}×${f.height})`}
            className="text-muted-foreground hover:text-foreground hover:bg-hover ring-border duration-fast inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs ring-1 transition-colors ease-out"
          >
            <Download className="size-2.5 shrink-0" />
            {f.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function SocialCard({ variant, src }: { variant: string; src: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <a
        href={src}
        download={`kortix-avatar-${variant.toLowerCase()}.png`}
        aria-label={`Download the ${variant.toLowerCase()} Kortix avatar, PNG`}
        className="group border-border relative block aspect-square overflow-hidden rounded-md border"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Kortix avatar ${variant}`} className="size-full object-cover" />
        <span className="bg-hover duration-fast absolute inset-0 flex items-center justify-center opacity-0 transition-opacity ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="bg-background ring-border flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm ring-1">
            <Download className="size-3" /> PNG
          </span>
        </span>
      </a>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium">Avatar</span>
        <span className="text-muted-foreground font-mono text-xs">{variant}</span>
      </div>
    </div>
  );
}

function Gallery({ children }: { children: React.ReactNode }) {
  return <div className={`bg-popover border-border rounded-md border p-4 ${GRID}`}>{children}</div>;
}

export default function WallpapersPage() {
  return (
    <DocPage
      title="Wallpapers"
      lead="Desktop and phone wallpapers in black and white, plus square social avatars. scripts/generate-wallpapers.mjs writes every file and this page's list, so a re-run updates it."
    >
      <DocSection
        title="Brand"
        description="Two families on a solid field and nothing else. Symbol is the mark alone, Logo is the full lockup. Both sit dead centre and are drawn from the source SVG at each size, so the edges stay exact on a high-density display."
      >
        <Gallery>
          {MARK_WALLPAPERS.map((w) => (
            <WallpaperCard key={`${w.id}-${w.theme}`} wallpaper={w} />
          ))}
        </Gallery>
      </DocSection>

      <DocSection
        title="Product"
        description="The wallpapers a person can set on a Kortix home. Most are live shader compositions, rendered at full size in a browser and captured as a still. Desktop is 5120×2880 and downsamples to 4K and 1440p. The phone file is its own portrait render, not a crop."
      >
        <Gallery>
          {PRODUCT_WALLPAPERS.map((w) => (
            <WallpaperCard key={`${w.id}-${w.theme}`} wallpaper={w} />
          ))}
        </Gallery>
      </DocSection>

      <DocSection
        title="Social avatar"
        description="The symbol centred on a solid field, square 1:1, for a profile picture or a social handle. 1000×1000 PNG, under 1 MB."
      >
        <Gallery>
          {SOCIAL_ASSETS.map((a) => (
            <SocialCard key={a.id} variant={a.variant} src={a.src} />
          ))}
        </Gallery>
      </DocSection>
    </DocPage>
  );
}
