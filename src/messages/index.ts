import en from './en';
import tr from './tr';

const messages: { [key: string]: any } = {
  en,
  tr,
};

const AVAILABLE_LANGS: string[] = Object.keys(messages);
const DEFAULT_LANG = 'en';

export default (ctx: any) => {
  const queryLang: string = ctx.req.query('lang').toLowerCase();
  const lang: string = AVAILABLE_LANGS.includes(queryLang)
    ? queryLang
    : DEFAULT_LANG;

  return (key: string): any => messages[lang][key];
};
