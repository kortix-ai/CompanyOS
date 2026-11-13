'use client';

import { Label } from '@kortix/ui/label';
import { Slider } from '@kortix/ui/slider';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function SliderPage() {
  const [volume, setVolume] = useState([40]);
  const [price, setPrice] = useState([20, 80]);
  const [temperature, setTemperature] = useState([0.7]);

  return (
    <DocPage
      title="Slider"
      lead="Pick a number on a range by dragging. The rail is one ink stroke that rises into a caret thumb. The value is always an array: one number per thumb."
    >
      <DocSection title="Single" description="Name the thumb with aria-label or thumbLabel; the thumb, not the root, is announced.">
        <Example
          code={`const [volume, setVolume] = useState([40]);

<div className="flex w-full max-w-sm flex-col gap-3">
  <div className="flex items-center justify-between">
    <Label>Volume</Label>
    <span className="text-muted-foreground text-xs tabular-nums">{volume[0]}%</span>
  </div>
  <Slider
    value={volume}
    onValueChange={setVolume}
    thumbLabel="Volume"
    formatValue={(v) => \`\${v}%\`}
  />
</div>`}
        >
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Volume</Label>
              <span className="text-muted-foreground text-xs tabular-nums">{volume[0]}%</span>
            </div>
            <Slider value={volume} onValueChange={setVolume} thumbLabel="Volume" formatValue={(v) => `${v}%`} />
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Range"
        description="Two values make two thumbs. thumbLabel names each one; minStepsBetweenThumbs keeps them apart."
      >
        <Example
          code={`const [price, setPrice] = useState([20, 80]);

<div className="flex w-full max-w-sm flex-col gap-3">
  <div className="flex items-center justify-between">
    <Label>Price</Label>
    <span className="text-muted-foreground text-xs tabular-nums">
      \${price[0]} – \${price[1]}
    </span>
  </div>
  <Slider
    value={price}
    onValueChange={setPrice}
    minStepsBetweenThumbs={5}
    thumbLabel={['Minimum price', 'Maximum price']}
  />
</div>`}
        >
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Price</Label>
              <span className="text-muted-foreground text-xs tabular-nums">
                ${price[0]} – ${price[1]}
              </span>
            </div>
            <Slider
              value={price}
              onValueChange={setPrice}
              minStepsBetweenThumbs={5}
              thumbLabel={['Minimum price', 'Maximum price']}
            />
          </div>
        </Example>
      </DocSection>

      <DocSection title="Step" description="min, max and step set the grid the thumb snaps to.">
        <Example
          code={`const [temperature, setTemperature] = useState([0.7]);

<div className="flex w-full max-w-sm flex-col gap-3">
  <div className="flex items-center justify-between">
    <Label>Temperature</Label>
    <span className="text-muted-foreground text-xs tabular-nums">{temperature[0]!.toFixed(1)}</span>
  </div>
  <Slider
    value={temperature}
    onValueChange={setTemperature}
    min={0}
    max={2}
    step={0.1}
    thumbLabel="Temperature"
  />
</div>`}
        >
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-muted-foreground text-xs tabular-nums">{temperature[0]!.toFixed(1)}</span>
            </div>
            <Slider
              value={temperature}
              onValueChange={setTemperature}
              min={0}
              max={2}
              step={0.1}
              thumbLabel="Temperature"
            />
          </div>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example code={`<Slider defaultValue={[60]} disabled thumbLabel="Disabled" className="max-w-sm" />`}>
          <Slider defaultValue={[60]} disabled thumbLabel="Disabled" className="max-w-sm" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
