import React from "react"
import { Plus, ArrowRight, ArrowLeft, Trash, GearSix, MagnifyingGlass, PencilSimple } from "@phosphor-icons/react"
import { Button } from "../openacp/components/ui/button"
import { Badge } from "../openacp/components/ui/badge"
import { Input } from "../openacp/components/ui/input"
import { Textarea } from "../openacp/components/ui/textarea"
import { Separator } from "../openacp/components/ui/separator"
import { Skeleton } from "../openacp/components/ui/skeleton"
import { Switch } from "../openacp/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../openacp/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../openacp/components/ui/tooltip"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../openacp/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "../openacp/components/ui/dropdown-menu"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../openacp/components/ui/select"
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "../openacp/components/ui/sheet"

export interface DemoEntry {
  id: string
  name: string
  group: string
  description: string
  type: "component" | "token"
  render: () => React.ReactNode
  code?: string
  props?: { name: string; type: string; default: string }[]
}

// ── Helper ──────────────────────────────────────────────────────────────────

function ColorSwatch({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="size-10 rounded-md border border-border-weak shrink-0"
        style={{ backgroundColor: `var(${variable})` }}
      />
      <div>
        <div className="text-sm-regular text-foreground">{name}</div>
        <div className="text-sm-regular text-muted-foreground font-mono">{variable}</div>
      </div>
    </div>
  )
}

function ShadowBox({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-20 rounded-lg bg-card"
        style={{ boxShadow: `var(${variable})` }}
      />
      <span className="text-sm-regular text-muted-foreground">{name}</span>
    </div>
  )
}

function RadiusBox({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-16 bg-accent border border-border-weak"
        style={{ borderRadius: `var(${variable})` }}
      />
      <span className="text-sm-regular text-muted-foreground">{name}</span>
    </div>
  )
}

// ── Registry ────────────────────────────────────────────────────────────────

export const registry: DemoEntry[] = [
  // ── General ─────────────────────────────────────────────────────────────
  {
    id: "button",
    name: "Button",
    group: "General",
    description: "Interactive button with multiple variants and sizes.",
    type: "component",
    render: () => (
      <div className="space-y-8">
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">Variants</div>
          <div className="flex flex-wrap gap-3">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">Sizes</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="xs">Extra Small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">Icon sizes</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="icon-xs">X</Button>
            <Button size="icon-sm">S</Button>
            <Button size="icon-md">M</Button>
            <Button size="icon-lg">L</Button>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">With icons</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button><Plus /> Create New</Button>
            <Button variant="outline"><MagnifyingGlass /> Search</Button>
            <Button variant="secondary">Next <ArrowRight /></Button>
            <Button variant="ghost"><ArrowLeft /> Back</Button>
            <Button variant="destructive"><Trash /> Delete</Button>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">Icon only — all sizes</div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-xs" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-xs<br/>24px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-sm" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-sm<br/>32px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-md" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-md<br/>36px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-lg" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-lg<br/>40px</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">Icon only — variants</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="icon-md" variant="default"><Plus /></Button>
            <Button size="icon-md" variant="secondary"><GearSix /></Button>
            <Button size="icon-md" variant="outline"><PencilSimple /></Button>
            <Button size="icon-md" variant="ghost"><MagnifyingGlass /></Button>
            <Button size="icon-md" variant="destructive"><Trash /></Button>
          </div>
        </div>
        <div>
          <div className="text-sm-medium text-muted-foreground mb-2">States</div>
          <div className="flex flex-wrap gap-3">
            <Button>Enabled</Button>
            <Button disabled>Disabled</Button>
            <Button disabled><Plus /> Disabled with icon</Button>
          </div>
        </div>
      </div>
    ),
    code: `import { Button } from "@/components/ui/button"
import { Plus, ArrowRight, Trash } from "@phosphor-icons/react"

// Text only
<Button variant="default">Click me</Button>

// Icon before text
<Button><Plus /> Create New</Button>

// Icon after text
<Button variant="secondary">Next <ArrowRight /></Button>

// Icon only
<Button size="icon-md" variant="outline"><Trash /></Button>`,
    props: [
      { name: "variant", type: '"default" | "secondary" | "outline" | "ghost" | "link" | "destructive"', default: '"default"' },
      { name: "size", type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"', default: '"default"' },
      { name: "asChild", type: "boolean", default: "false" },
      { name: "disabled", type: "boolean", default: "false" },
    ],
  },
  {
    id: "badge",
    name: "Badge",
    group: "General",
    description: "Small status indicator with variants.",
    type: "component",
    render: () => (
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </div>
    ),
    code: `import { Badge } from "@/components/ui/badge"

<Badge variant="default">Status</Badge>`,
    props: [
      { name: "variant", type: '"default" | "secondary" | "outline" | "destructive"', default: '"default"' },
    ],
  },
  {
    id: "input",
    name: "Input",
    group: "General",
    description: "Text input field.",
    type: "component",
    render: () => (
      <div className="space-y-3 max-w-sm">
        <Input placeholder="Default input" />
        <Input placeholder="Disabled" disabled />
        <Input type="password" placeholder="Password" />
      </div>
    ),
    code: `import { Input } from "@/components/ui/input"

<Input placeholder="Enter text..." />`,
    props: [
      { name: "type", type: "string", default: '"text"' },
      { name: "placeholder", type: "string", default: '""' },
      { name: "disabled", type: "boolean", default: "false" },
    ],
  },
  {
    id: "textarea",
    name: "Textarea",
    group: "General",
    description: "Multi-line text input.",
    type: "component",
    render: () => (
      <div className="max-w-sm">
        <Textarea placeholder="Type your message here..." />
      </div>
    ),
    code: `import { Textarea } from "@/components/ui/textarea"

<Textarea placeholder="Type here..." />`,
  },
  {
    id: "separator",
    name: "Separator",
    group: "General",
    description: "Visual divider between content sections.",
    type: "component",
    render: () => (
      <div className="space-y-4">
        <div className="text-md-regular text-foreground">Above separator</div>
        <Separator />
        <div className="text-md-regular text-foreground">Below separator</div>
        <div className="flex items-center gap-4 h-5">
          <span className="text-md-regular">Left</span>
          <Separator orientation="vertical" />
          <span className="text-md-regular">Right</span>
        </div>
      </div>
    ),
    code: `import { Separator } from "@/components/ui/separator"

<Separator />
<Separator orientation="vertical" />`,
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "General",
    description: "Loading placeholder animation.",
    type: "component",
    render: () => (
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    ),
    code: `import { Skeleton } from "@/components/ui/skeleton"

<Skeleton className="h-4 w-[200px]" />`,
  },

  // ── Overlay ─────────────────────────────────────────────────────────────
  {
    id: "dialog",
    name: "Dialog",
    group: "Overlay",
    description: "Modal dialog overlay.",
    type: "component",
    render: () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>This is a dialog description.</DialogDescription>
          </DialogHeader>
          <div className="text-md-regular text-foreground-weak py-4">Dialog body content goes here.</div>
        </DialogContent>
      </Dialog>
    ),
    code: `import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
  },
  {
    id: "dropdown-menu",
    name: "DropdownMenu",
    group: "Overlay",
    description: "Contextual menu triggered by a button.",
    type: "component",
    render: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Open Menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    code: `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
  },
  {
    id: "sheet",
    name: "Sheet",
    group: "Overlay",
    description: "Slide-out panel from the edge of the screen.",
    type: "component",
    render: () => (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Open Sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description goes here.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    ),
    code: `import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

<Sheet>
  <SheetTrigger asChild>
    <Button>Open</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
    </SheetHeader>
  </SheetContent>
</Sheet>`,
  },
  {
    id: "tooltip",
    name: "Tooltip",
    group: "Overlay",
    description: "Popup hint on hover.",
    type: "component",
    render: () => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Tooltip content</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    code: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover</TooltipTrigger>
    <TooltipContent>Content</TooltipContent>
  </Tooltip>
</TooltipProvider>`,
  },
  {
    id: "select",
    name: "Select",
    group: "Overlay",
    description: "Dropdown selection control.",
    type: "component",
    render: () => (
      <div className="max-w-sm">
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
            <SelectItem value="b">Option B</SelectItem>
            <SelectItem value="c">Option C</SelectItem>
          </SelectContent>
        </Select>
      </div>
    ),
    code: `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Pick..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>`,
  },

  // ── Navigation ──────────────────────────────────────────────────────────
  {
    id: "tabs",
    name: "Tabs",
    group: "Navigation",
    description: "Tabbed navigation between content panels.",
    type: "component",
    render: () => (
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="text-md-regular text-foreground-weak p-4">Content for Tab 1</TabsContent>
        <TabsContent value="tab2" className="text-md-regular text-foreground-weak p-4">Content for Tab 2</TabsContent>
        <TabsContent value="tab3" className="text-md-regular text-foreground-weak p-4">Content for Tab 3</TabsContent>
      </Tabs>
    ),
    code: `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content</TabsContent>
</Tabs>`,
  },

  // ── Data Display ────────────────────────────────────────────────────────
  {
    id: "switch",
    name: "Switch",
    group: "Data Display",
    description: "Toggle switch for on/off states.",
    type: "component",
    render: () => (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch id="s1" />
          <label htmlFor="s1" className="text-md-regular text-foreground">Default</label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="s2" defaultChecked />
          <label htmlFor="s2" className="text-md-regular text-foreground">Checked</label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="s3" disabled />
          <label htmlFor="s3" className="text-md-regular text-muted-foreground">Disabled</label>
        </div>
      </div>
    ),
    code: `import { Switch } from "@/components/ui/switch"

<Switch />`,
  },

  // ── Tokens ──────────────────────────────────────────────────────────────
  {
    id: "colors",
    name: "Colors",
    group: "Tokens",
    description: "Design system color tokens — shadcn core + extensions.",
    type: "token",
    render: () => (
      <div className="space-y-8">
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Core</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorSwatch name="Background" variable="--background" />
            <ColorSwatch name="Foreground" variable="--foreground" />
            <ColorSwatch name="Card" variable="--card" />
            <ColorSwatch name="Card Foreground" variable="--card-foreground" />
            <ColorSwatch name="Popover" variable="--popover" />
            <ColorSwatch name="Popover Foreground" variable="--popover-foreground" />
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Semantic</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorSwatch name="Primary" variable="--primary" />
            <ColorSwatch name="Primary Foreground" variable="--primary-foreground" />
            <ColorSwatch name="Secondary" variable="--secondary" />
            <ColorSwatch name="Secondary Foreground" variable="--secondary-foreground" />
            <ColorSwatch name="Muted" variable="--muted" />
            <ColorSwatch name="Muted Foreground" variable="--muted-foreground" />
            <ColorSwatch name="Accent" variable="--accent" />
            <ColorSwatch name="Accent Foreground" variable="--accent-foreground" />
            <ColorSwatch name="Destructive" variable="--destructive" />
            <ColorSwatch name="Destructive Foreground" variable="--destructive-foreground" />
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Extensions</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorSwatch name="Border" variable="--border" />
            <ColorSwatch name="Border Weak" variable="--border-weak" />
            <ColorSwatch name="Input" variable="--input" />
            <ColorSwatch name="Ring" variable="--ring" />
            <ColorSwatch name="Foreground Weak" variable="--foreground-weak" />
            <ColorSwatch name="Foreground Weaker" variable="--foreground-weaker" />
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Sidebar</h3>
          <div className="grid grid-cols-2 gap-4">
            <ColorSwatch name="Sidebar Background" variable="--sidebar-background" />
            <ColorSwatch name="Sidebar Foreground" variable="--sidebar-foreground" />
            <ColorSwatch name="Sidebar Accent" variable="--sidebar-accent" />
            <ColorSwatch name="Sidebar Border" variable="--sidebar-border" />
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Avatar</h3>
          <div className="grid grid-cols-3 gap-4">
            {["pink", "mint", "orange", "purple", "cyan", "lime"].map((c) => (
              <div key={c} className="flex items-center gap-2">
                <div
                  className="size-8 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{ background: `var(--avatar-background-${c})`, color: `var(--avatar-text-${c})` }}
                >
                  {c[0].toUpperCase()}
                </div>
                <span className="text-sm-regular text-muted-foreground capitalize">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "typography",
    name: "Typography",
    group: "Tokens",
    description: "Font families, sizes, weights, and line heights.",
    type: "token",
    render: () => (
      <div className="space-y-6">
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Font Families</h3>
          <div className="space-y-2">
            <p style={{ fontFamily: "var(--font-family-sans)" }} className="text-foreground">Sans — The quick brown fox jumps over the lazy dog</p>
            <p style={{ fontFamily: "var(--font-family-mono)" }} className="text-foreground">Mono — The quick brown fox jumps over the lazy dog</p>
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Text Utilities</h3>
          <div className="space-y-3">
            <div className="text-xl-medium text-foreground">text-xl-medium — Heading</div>
            <div className="text-lg-medium text-foreground">text-lg-medium — Subheading</div>
            <div className="text-md-medium text-foreground">text-md-medium — Label</div>
            <div className="text-md-regular text-foreground">text-md-regular — Body</div>
            <div className="text-sm-medium text-foreground">text-sm-medium — Caption bold</div>
            <div className="text-sm-regular text-foreground">text-sm-regular — Caption</div>
          </div>
        </div>
        <div>
          <h3 className="text-md-medium text-foreground mb-3">Foreground Scale</h3>
          <div className="space-y-2">
            <p className="text-md-regular text-foreground">Foreground — primary text</p>
            <p className="text-md-regular text-foreground-weak">Foreground Weak — secondary text</p>
            <p className="text-md-regular text-muted-foreground">Muted Foreground — muted text</p>
            <p className="text-md-regular text-foreground-weaker">Foreground Weaker — weakest text</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "spacing",
    name: "Spacing",
    group: "Tokens",
    description: "Spacing scale based on 0.25rem (4px) increments.",
    type: "token",
    render: () => (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
          <div key={n} className="flex items-center gap-4">
            <span className="text-sm-regular text-muted-foreground font-mono w-8 text-right">{n}</span>
            <div className="bg-primary rounded-sm" style={{ width: `${n * 4}px`, height: "16px" }} />
            <span className="text-sm-regular text-foreground-weaker">{n * 4}px / {n * 0.25}rem</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "shadows",
    name: "Shadows",
    group: "Tokens",
    description: "Shadow tokens for elevation.",
    type: "token",
    render: () => (
      <div className="flex flex-wrap gap-8">
        <ShadowBox name="xs" variable="--shadow-xs" />
        <ShadowBox name="md" variable="--shadow-md" />
        <ShadowBox name="lg" variable="--shadow-lg" />
      </div>
    ),
  },
  {
    id: "radius",
    name: "Radius",
    group: "Tokens",
    description: "Border radius tokens.",
    type: "token",
    render: () => (
      <div className="flex flex-wrap gap-6">
        <RadiusBox name="xs" variable="--radius-xs" />
        <RadiusBox name="sm" variable="--radius-sm" />
        <RadiusBox name="md" variable="--radius-md" />
        <RadiusBox name="lg" variable="--radius-lg" />
        <RadiusBox name="xl" variable="--radius-xl" />
      </div>
    ),
  },
]
