// Font families packaged with the renderer. Ordinary Latin design remains Arial.
const choices = [
 ['Arabic','Noto Sans Arabic'],['Hebrew','Noto Sans Hebrew'],
 ['Devanagari','Noto Sans Devanagari'],['Bengali','Noto Sans Bengali'],
 ['Gurmukhi','Noto Sans Gurmukhi'],['Tamil','Noto Sans Tamil'],
 ['Telugu','Noto Sans Telugu'],['Kannada','Noto Sans Kannada'],
 ['Malayalam','Noto Sans Malayalam'],['Gujarati','Noto Sans Gujarati'],
 ['Oriya','Noto Sans Oriya'],['Sinhala','Noto Sans Sinhala'],
 ['Thai','Noto Sans Thai'],['Khmer','Noto Sans Khmer'],['Lao','Noto Sans Lao'],
 ['Myanmar','Noto Sans Myanmar'],['Tibetan','Noto Serif Tibetan'],
 ['Mongolian','Noto Sans Mongolian'],['Georgian','Noto Sans Georgian'],
 ['Armenian','Noto Sans Armenian'],['Ethiopic','Noto Sans Ethiopic'],
 ['Sundanese','Noto Sans Sundanese'],['Javanese','Noto Sans Javanese'],
 ['Balinese','Noto Sans Balinese'],['Buginese','Noto Sans Buginese']
].map(([script,font])=>[new RegExp('\\p{Script='+script+'}','u'),font]);
export function fontForText(text='',context='',language='') {
 if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))return 'Noto Sans CJK JP';
 if(/\p{Script=Hangul}/u.test(text))return 'Noto Sans CJK KR';
 if(/\p{Script=Han}/u.test(text)){
  if(language==='Japanese'||/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(context))return 'Noto Sans CJK JP';
  if(language==='Chinese (Traditional)'||language==='Cantonese (Traditional)')return 'Noto Sans CJK TC';
  if(language==='Korean')return 'Noto Sans CJK KR';
  return 'Noto Sans CJK SC';
 }
 for(const [pattern,font]of choices)if(pattern.test(text))return font;
 if(/[\u2200-\u22FF\u27C0-\u27EF\u2980-\u2AFF]/u.test(text))return 'Noto Sans Math';
 if(/[\u2300-\u27BF\u2B00-\u2BFF]/u.test(text))return 'Noto Sans Symbols2';
 return 'Arial';
}
