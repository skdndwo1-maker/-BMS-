import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { DesignContent, DesignStyle } from "@/design/types";

interface QuickStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadDemo: (content: DesignContent) => void;
}

const demoTemplates = [
  {
    name: 'Product Launch',
    style: 'no-limit' as DesignStyle,
    content: {
      title: 'Introducing Next Gen',
      subtitle: 'Innovation meets simplicity',
      bodyText: 'Experience the future of productivity with our revolutionary new platform. Built for teams who demand excellence.',
      style: 'no-limit' as DesignStyle,
    },
  },
  {
    name: 'Team Event',
    style: 'basic' as DesignStyle,
    content: {
      title: 'Annual Team Summit 2026',
      subtitle: 'March 25-27, San Francisco',
      bodyText: 'Join us for three days of collaboration, innovation, and celebration. Register by March 15th.',
      style: 'basic' as DesignStyle,
    },
  },
  {
    name: 'Internal Notice',
    style: 'informational' as DesignStyle,
    content: {
      title: 'Office Update',
      subtitle: 'New Policies Effective April 1st',
      bodyText: 'We\'re implementing new hybrid work guidelines to better support team flexibility. Full details available on the intranet.',
      style: 'informational' as DesignStyle,
    },
  },
];

export function QuickStartDialog({ open, onOpenChange, onLoadDemo }: QuickStartDialogProps) {
  const handleLoadDemo = (content: DesignContent) => {
    onLoadDemo(content);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Quick Start Demo
          </DialogTitle>
          <DialogDescription>
            Load a pre-filled template to see the platform in action
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {demoTemplates.map((template) => (
            <button
              key={template.name}
              onClick={() => handleLoadDemo(template.content)}
              className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">{template.name}</h4>
                  <p className="text-sm text-gray-600 mb-2">"{template.content.title}"</p>
                  <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700">
                    {template.style} style
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Start from Scratch
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}