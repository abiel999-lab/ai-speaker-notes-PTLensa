import { textHeight, wrapText } from './layout.js';

export function applyTypography(scene, settings) {
    if (scene.typographyApplied) return scene;
    const scale = settings.fontScale ?? 1;
    const compact = settings.density === 'compact';
    if (scale === 1 && !compact) return scene;
    return {
        ...scene,
        typographyApplied: true,
        slides: scene.slides.map(slide => ({
            ...slide,
            objects: slide.objects.map(object => {
                if (!object.fontSize) return object;
                if (object.type === 'table') {
                    // Keep existing row geometry. A larger table can overlap adjacent blocks.
                    return {...object, fontSize:Math.round(object.fontSize * Math.min(1,scale)*10)/10};
                }
                if (object.type !== 'text' || !object.text) return object;
                const original=object.fontSize;
                const requested=Math.round(original*scale*10)/10;
                let size=requested;
                const spacing=compact?1.15:1.28;
                if (size>original) {
                    while (size>original &&
                        textHeight(wrapText(object.text, object.w, size, object.bold).length,size)*spacing>object.h)
                        size=Math.max(original,Math.round((size-0.25)*10)/10);
                }
                return {...object,fontSize:size,lineSpacing:size*spacing};
            }),
        })),
    };
}
