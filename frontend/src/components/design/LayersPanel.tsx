import type { DesignLayer, DesignContent } from "@/design/types";
import { Eye, EyeOff, Lock, Type, Image as ImageIcon, Square } from "lucide-react";
import { useMemo } from "react";

interface LayersPanelProps {
  content: DesignContent;
}

export function LayersPanel({ content }: LayersPanelProps) {
  // Generate layers based on content
  const generateLayers = (): DesignLayer[] => {
    const layers: DesignLayer[] = [];

    if (content.logo) {
      layers.push({
        id: 'logo',
        name: 'Logo',
        type: 'logo',
        visible: true,
        locked: false,
      });
    }

    layers.push({
      id: 'background',
      name: 'Background',
      type: 'shape',
      visible: true,
      locked: true,
    });

    if (content.image) {
      layers.push({
        id: 'main-image',
        name: 'Main Image',
        type: 'image',
        visible: true,
        locked: false,
      });
    }

    if (content.title) {
      layers.push({
        id: 'title',
        name: 'Title',
        type: 'text',
        visible: true,
        locked: false,
      });
    }

    if (content.subtitle) {
      layers.push({
        id: 'subtitle',
        name: 'Subtitle',
        type: 'text',
        visible: true,
        locked: false,
      });
    }

    if (content.bodyText) {
      layers.push({
        id: 'body',
        name: 'Body Text',
        type: 'text',
        visible: true,
        locked: false,
      });
    }

    return layers;
  };

  const layers = useMemo(() => generateLayers(), [content]);

  const getLayerIcon = (type: DesignLayer["type"]) => {
    switch (type) {
      case 'text':
        return <Type className="w-4 h-4 text-gray-500" />;
      case 'image':
      case 'logo':
        return <ImageIcon className="w-4 h-4 text-gray-500" />;
      case 'shape':
        return <Square className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="h-full bg-white flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Layers</h3>
        <p className="text-xs text-gray-500 mt-1">View design structure</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {[...layers].reverse().map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getLayerIcon(layer.type)}
                <span className="text-sm text-gray-700 truncate">{layer.name}</span>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {layer.visible ? (
                  <Eye className="w-4 h-4 text-gray-400" />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-400" />
                )}
                {layer.locked && (
                  <Lock className="w-3 h-3 text-gray-400" />
                )}
              </div>
            </div>
          ))}

          {layers.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Square className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No layers yet</p>
              <p className="text-xs mt-1">Add content to see layers</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500">
          <p className="font-medium mb-1">Layer Info</p>
          <p>Auto-managed for consistency</p>
        </div>
      </div>
    </div>
  );
}
