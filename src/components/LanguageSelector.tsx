import { useTranslation, type SupportedLanguage } from '../lib/i18n';

export function LanguageSelector() {
  const { language, setLanguage, t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as SupportedLanguage);
  };

  return (
    <div className="language-selector-container">
      <select 
        value={language} 
        onChange={handleChange}
        className="language-selector"
        aria-label={t('switch_language')}
      >
        <option value="en">English (EN)</option>
        <option value="es">Español (ES)</option>
        <option value="zh">中文 (ZH)</option>
        <option value="ru">Русский (RU)</option>
        <option value="de">Deutsch (DE)</option>
        <option value="pt">Português (PT)</option>
      </select>
    </div>
  );
}
