import {
  ArrowRightIcon,
  CheckIcon,
  FileIcon,
  FolderIcon,
  GitBranchIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { KortixLogo } from "../../primitives/kortix-logo";
import { ConnectorLogo } from "../../internal/connector-logo/connector-logo";

/** Product diagrams, not screenshots or claims about the current workspace. */
export function OnboardingArt({
  kind,
  label,
  detail,
}: {
  kind:
    | "team"
    | "alone"
    | "workspace"
    | "framework"
    | "tools"
    | "work"
    | "finish"
    | "model";
  label: string;
  detail: string;
}) {
  return (
    <div
      aria-hidden
      className="mb-8 flex min-h-48 w-full items-center justify-center py-5 sm:min-h-64"
    >
      {kind === "alone" ? (
        <div className="grid w-full grid-cols-3 gap-3 sm:gap-5">
          {[0, 1, 2].map((n) => (
            <div
              key={n}
              className="bg-popover flex min-w-0 flex-col gap-5 rounded-md border p-4"
            >
              <UserIcon className="text-muted-foreground size-6" />
              <span className="bg-muted h-2 w-full rounded-full" />
              <span className="bg-muted h-2 w-2/3 rounded-full" />
              <span className="bg-muted h-2 w-4/5 rounded-full" />
              <span className="text-muted-foreground truncate text-xs">
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : kind === "framework" ? (
        <div className="bg-popover w-full rounded-md border">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <KortixLogo
              variant="icon"
              size={24}
              className="text-foreground shrink-0"
            />
            <span className="text-foreground text-sm font-medium">{label}</span>
            <GitBranchIcon className="text-muted-foreground ml-auto size-4" />
          </div>
          <div className="grid grid-cols-2 gap-5 p-5">
            <ul className="space-y-3 font-mono text-xs">
              {[
                "kortix.yaml",
                "agents/",
                "skills/",
                "memory/",
                "connectors/",
              ].map((name) => (
                <li
                  key={name}
                  className="text-muted-foreground flex items-center gap-2"
                >
                  {name.endsWith("/") ? (
                    <FolderIcon className="size-4 shrink-0" />
                  ) : (
                    <FileIcon className="size-4 shrink-0" />
                  )}
                  <span
                    className={
                      name === "kortix.yaml" ? "text-foreground" : undefined
                    }
                  >
                    {name}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col justify-center gap-3 border-l pl-5">
              {["pi", "@kortix/sdk", "@kortix/ui"].map((name) => (
                <span key={name} className="text-foreground font-mono text-xs">
                  {name}
                </span>
              ))}
              <span className="text-muted-foreground text-xs">{detail}</span>
            </div>
          </div>
        </div>
      ) : kind === "tools" || kind === "team" ? (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="grid w-full grid-cols-3 gap-3">
            {["github", "gmail", "notion"].map((slug) => (
              <AppTile key={slug} slug={slug} />
            ))}
          </div>
          <div className="flex w-full items-center gap-5">
            <span className="border-border flex-1 border-t border-dashed" />
            <KortixLogo
              variant="icon"
              size={48}
              className="text-foreground shrink-0"
            />
            <span className="border-border flex-1 border-t border-dashed" />
          </div>
          <div className="grid w-full grid-cols-3 gap-3">
            {["slack", "linear", "googlecalendar"].map((slug) => (
              <AppTile key={slug} slug={slug} />
            ))}
          </div>
        </div>
      ) : kind === "model" ? (
        <div className="flex w-full items-center gap-5">
          <div className="bg-popover flex flex-1 flex-col items-center gap-3 rounded-md border px-3 py-8">
            <KortixLogo variant="icon" size={48} className="text-foreground" />
            <span className="text-foreground text-sm">{label}</span>
          </div>
          <span className="border-border w-8 border-t border-dashed" />
          <div className="flex flex-1 flex-col gap-3">
            {["ChatGPT", "Claude", "API"].map((name) => (
              <div
                key={name}
                className="bg-popover text-foreground rounded-md border px-3 py-3 font-mono text-xs"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      ) : kind === "work" ? (
        <div className="bg-popover w-full rounded-md border">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <KortixLogo variant="icon" size={24} className="text-foreground" />
            <span className="text-foreground text-sm font-medium">{label}</span>
          </div>
          <div className="flex flex-col gap-5 p-5">
            <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
              <GitBranchIcon className="size-4" />
              session/work <ArrowRightIcon className="ml-auto size-4" /> change
              request
            </div>
            <div className="flex items-center gap-3">
              <FileIcon className="text-muted-foreground size-8" />
              <span className="text-foreground text-sm">{detail}</span>
              <CheckIcon className="text-muted-foreground ml-auto size-5" />
            </div>
            <div className="border-border border-t border-dashed" />
            <div className="flex gap-2">
              <span className="bg-muted h-2 flex-1 rounded-full" />
              <span className="bg-muted h-2 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-popover w-full rounded-md border">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <KortixLogo
              variant="icon"
              size={28}
              className="text-foreground shrink-0"
            />
            <span className="text-foreground text-sm font-medium">{label}</span>
          </div>
          <div className="grid grid-cols-3">
            <div className="text-muted-foreground flex flex-col gap-3 border-r p-4 font-mono text-xs">
              <span>agents/</span>
              <span>skills/</span>
              <span>memory/</span>
            </div>
            <div className="col-span-2 flex flex-col gap-5 p-5">
              <div className="flex gap-2">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="bg-background flex size-8 items-center justify-center rounded-full border"
                  >
                    <UserIcon className="text-muted-foreground size-4" />
                  </span>
                ))}
              </div>
              <span className="text-foreground text-sm">{detail}</span>
              <span className="bg-muted h-2 w-4/5 rounded-full" />
              <span className="bg-muted h-2 w-2/3 rounded-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppTile({ slug }: { slug: string }) {
  return (
    <div className="bg-popover flex items-center justify-center rounded-md border py-4">
      <ConnectorLogo
        source={{ icon: `https://logos.composio.dev/api/${slug}` }}
        size="lg"
      />
    </div>
  );
}
