import React from 'react';
import { useTranslation } from '../../../i18n';
import { Category } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Modal } from '../../../components/ui/Modal';
import { Palette, Ruler, FolderTree, Sparkles, Sun, Tag } from 'lucide-react';

interface ProductAttributeModalsProps {
  // Add Color Modal
  isAddColorModalOpen: boolean;
  setIsAddColorModalOpen: (open: boolean) => void;
  newColorName: string;
  setNewColorName: (val: string) => void;
  newColorHex: string;
  setNewColorHex: (val: string) => void;
  isCreatingColor: boolean;
  onCreateColor: () => void;

  // Add Size Modal
  isAddSizeModalOpen: boolean;
  setIsAddSizeModalOpen: (open: boolean) => void;
  newSizeName: string;
  setNewSizeName: (val: string) => void;
  isCreatingSize: boolean;
  onCreateSize: () => void;

  // Add Category Modal
  isAddCategoryModalOpen: boolean;
  setIsAddCategoryModalOpen: (open: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (val: string) => void;
  newCategoryParentId: number | '';
  setNewCategoryParentId: (val: number | '') => void;
  isCreatingCategory: boolean;
  onCreateCategory: () => void;
  categoryOptions: { value: number; label: string }[];

  // Add Collection Modal
  isAddCollectionModalOpen: boolean;
  setIsAddCollectionModalOpen: (open: boolean) => void;
  newCollectionName: string;
  setNewCollectionName: (val: string) => void;
  isCreatingCollection: boolean;
  onCreateCollection: () => void;

  // Add Season Modal
  isAddSeasonModalOpen: boolean;
  setIsAddSeasonModalOpen: (open: boolean) => void;
  newSeasonName: string;
  setNewSeasonName: (val: string) => void;
  newSeasonCode: string;
  setNewSeasonCode: (val: string) => void;
  isCreatingSeason: boolean;
  onCreateSeason: () => void;

  // Add Brand Modal
  isAddBrandModalOpen: boolean;
  setIsAddBrandModalOpen: (open: boolean) => void;
  newBrandName: string;
  setNewBrandName: (val: string) => void;
  isCreatingBrand: boolean;
  onCreateBrand: () => void;
}

export const ProductAttributeModals: React.FC<ProductAttributeModalsProps> = ({
  isAddColorModalOpen,
  setIsAddColorModalOpen,
  newColorName,
  setNewColorName,
  newColorHex,
  setNewColorHex,
  isCreatingColor,
  onCreateColor,

  isAddSizeModalOpen,
  setIsAddSizeModalOpen,
  newSizeName,
  setNewSizeName,
  isCreatingSize,
  onCreateSize,

  isAddCategoryModalOpen,
  setIsAddCategoryModalOpen,
  newCategoryName,
  setNewCategoryName,
  newCategoryParentId,
  setNewCategoryParentId,
  isCreatingCategory,
  onCreateCategory,
  categoryOptions,

  isAddCollectionModalOpen,
  setIsAddCollectionModalOpen,
  newCollectionName,
  setNewCollectionName,
  isCreatingCollection,
  onCreateCollection,

  isAddSeasonModalOpen,
  setIsAddSeasonModalOpen,
  newSeasonName,
  setNewSeasonName,
  newSeasonCode,
  setNewSeasonCode,
  isCreatingSeason,
  onCreateSeason,

  isAddBrandModalOpen,
  setIsAddBrandModalOpen,
  newBrandName,
  setNewBrandName,
  isCreatingBrand,
  onCreateBrand,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* Inline Add Color Modal */}
      <Modal
        isOpen={isAddColorModalOpen}
        onClose={() => setIsAddColorModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('products.createNewColorTitle')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddColorModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingColor} onClick={onCreateColor}>
              {t('products.createAndSelectColor')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.colorName', 'Color Name')} *`}
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            placeholder={t('products.colorNamePlaceholder', 'e.g. Charcoal Black')}
            autoFocus
          />
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              {t('products.colorHexLabel', 'Color Code (Hex)')}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value)}
                className="w-10 h-10 rounded-md border border-neutral-200 dark:border-neutral-700 cursor-pointer p-0.5 bg-white dark:bg-[#181a20]"
              />
              <input
                type="text"
                value={newColorHex}
                onChange={(e) => setNewColorHex(e.target.value)}
                className="flex-1 bg-white dark:bg-[#181a20] border border-neutral-200 dark:border-neutral-700 rounded-md text-xs px-3 py-2 font-mono uppercase text-neutral-900 dark:text-neutral-100"
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Inline Add Size Modal */}
      <Modal
        isOpen={isAddSizeModalOpen}
        onClose={() => setIsAddSizeModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('products.createNewSizeTitle', 'Add New Size')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddSizeModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingSize} onClick={onCreateSize}>
              {t('products.createAndSelectSize', 'Create & Select Size')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.sizeName', 'Size Name')} *`}
            value={newSizeName}
            onChange={(e) => setNewSizeName(e.target.value)}
            placeholder={t('products.sizeNamePlaceholder', 'e.g. XL or 42')}
            autoFocus
          />
        </div>
      </Modal>

      {/* Inline Add Category Modal */}
      <Modal
        isOpen={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{t('products.createNewCategoryTitle', 'Add New Category')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddCategoryModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingCategory} onClick={onCreateCategory}>
              {t('products.createAndSelectCategory', 'Create & Select Category')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.categoryName', 'Category Name')} *`}
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder={t('products.categoryNamePlaceholder', 'e.g. Men Jackets')}
            autoFocus
          />
          <Select
            label={t('products.parentCategory', 'Parent Category')}
            value={newCategoryParentId}
            onChange={(e) => setNewCategoryParentId(e.target.value ? Number(e.target.value) : '')}
            options={[
              { value: '', label: t('products.noParentCategory', 'Root Category (Top Level)') },
              ...categoryOptions,
            ]}
          />
        </div>
      </Modal>

      {/* Inline Add Collection Modal */}
      <Modal
        isOpen={isAddCollectionModalOpen}
        onClose={() => setIsAddCollectionModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>{t('products.createNewCollectionTitle', 'Add New Collection')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddCollectionModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingCollection} onClick={onCreateCollection}>
              {t('products.createAndSelectCollection', 'Create & Select Collection')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.collectionName', 'Collection Name')} *`}
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder={t('products.collectionName', 'Collection Name')}
            autoFocus
          />
        </div>
      </Modal>

      {/* Inline Add Season Modal */}
      <Modal
        isOpen={isAddSeasonModalOpen}
        onClose={() => setIsAddSeasonModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <span>{t('products.createNewSeasonTitle', 'Add New Season')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddSeasonModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingSeason} onClick={onCreateSeason}>
              {t('products.createAndSelectSeason', 'Create & Select Season')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.seasonName', 'Season Name')} *`}
            value={newSeasonName}
            onChange={(e) => setNewSeasonName(e.target.value)}
            placeholder={t('products.seasonNamePlaceholder', 'e.g. Spring/Summer 2026')}
            autoFocus
          />
          <Input
            label={t('products.seasonCode', 'Season Code')}
            value={newSeasonCode}
            onChange={(e) => setNewSeasonCode(e.target.value)}
            placeholder="e.g. SS26 or FW26"
          />
        </div>
      </Modal>

      {/* Inline Add Brand Modal */}
      <Modal
        isOpen={isAddBrandModalOpen}
        onClose={() => setIsAddBrandModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('products.createNewBrandTitle', 'Add New Brand')}</span>
          </div>
        }
        maxWidth="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddBrandModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" isLoading={isCreatingBrand} onClick={onCreateBrand}>
              {t('products.createAndSelectBrand', 'Create & Select Brand')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label={`${t('products.brandName', 'Brand Name')} *`}
            value={newBrandName}
            onChange={(e) => setNewBrandName(e.target.value)}
            placeholder={t('products.brandName', 'Brand Name')}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
};
