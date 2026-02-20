"use client";

import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  SupplementProduct,
  ProteinFields,
  PreWorkoutFields,
  HydrationFields,
  CreatineFields,
  SupplementCategory
} from "./supplement-fields";

interface CategoryFieldsProps {
  product: SupplementProduct;
  isEditing: boolean;
  onChange: (updates: Partial<SupplementProduct>) => void;
}

export function ProteinFieldsComponent({ product, isEditing, onChange }: CategoryFieldsProps) {
  const proteinFields = product.proteinFields || {} as ProteinFields;

  const updateProteinFields = (updates: Partial<ProteinFields>) => {
    onChange({
      proteinFields: { ...proteinFields, ...updates }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Protein Content (g/serving)</label>
        <Input
          type="number"
          value={proteinFields.proteinContent || ''}
          onChange={(e) => updateProteinFields({ proteinContent: Number(e.target.value) })}
          placeholder="24"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">BCAA Content (g/serving)</label>
        <Input
          type="number"
          step="0.1"
          value={proteinFields.bcaaContent || ''}
          onChange={(e) => updateProteinFields({ bcaaContent: Number(e.target.value) })}
          placeholder="5.5"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Carbohydrates (g/serving)</label>
        <Input
          type="number"
          value={proteinFields.carbsPerServing || ''}
          onChange={(e) => updateProteinFields({ carbsPerServing: Number(e.target.value) })}
          placeholder="3"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Fat (g/serving)</label>
        <Input
          type="number"
          value={proteinFields.fatPerServing || ''}
          onChange={(e) => updateProteinFields({ fatPerServing: Number(e.target.value) })}
          placeholder="1"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Sugar (g/serving)</label>
        <Input
          type="number"
          value={proteinFields.sugarPerServing || ''}
          onChange={(e) => updateProteinFields({ sugarPerServing: Number(e.target.value) })}
          placeholder="1"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Protein Sources</label>
        <Input
          value={proteinFields.proteinSource?.join(', ') || ''}
          onChange={(e) => updateProteinFields({ 
            proteinSource: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
          })}
          placeholder="Whey Protein Isolate, Whey Protein Concentrate"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
        <p className="text-xs text-gray-500 mt-1">Separate multiple sources with commas</p>
      </div>
    </div>
  );
}

export function PreWorkoutFieldsComponent({ product, isEditing, onChange }: CategoryFieldsProps) {
  const preWorkoutFields = product.preWorkoutFields || {} as PreWorkoutFields;

  const updatePreWorkoutFields = (updates: Partial<PreWorkoutFields>) => {
    onChange({
      preWorkoutFields: { ...preWorkoutFields, ...updates }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Caffeine Content (mg/serving)</label>
        <Input
          type="number"
          value={preWorkoutFields.caffeineContent || ''}
          onChange={(e) => updatePreWorkoutFields({ caffeineContent: Number(e.target.value) })}
          placeholder="200"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Stimulant Type</label>
        <Select
          value={preWorkoutFields.stimulantType || 'stim-free'}
          onValueChange={(value) => updatePreWorkoutFields({ stimulantType: value as any })}
        >
          <SelectTrigger className="h-auto px-0 py-1 text-base bg-transparent border-none shadow-none focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stim-free">Stim-Free</SelectItem>
            <SelectItem value="low-stim">Low Stim</SelectItem>
            <SelectItem value="high-stim">High Stim</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Formula Type</label>
        <Select
          value={preWorkoutFields.formulationType || 'hybrid'}
          onValueChange={(value) => updatePreWorkoutFields({ formulationType: value as any })}
        >
          <SelectTrigger className="h-auto px-0 py-1 text-base bg-transparent border-none shadow-none focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="energy">Energy Focus</SelectItem>
            <SelectItem value="pump">Pump Focus</SelectItem>
            <SelectItem value="focus">Cognitive Focus</SelectItem>
            <SelectItem value="hybrid">Hybrid (All-in-One)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">L-Citrulline (g/serving)</label>
        <Input
          type="number"
          step="0.1"
          value={preWorkoutFields.pumpIngredients?.citrulline || ''}
          onChange={(e) => updatePreWorkoutFields({
            pumpIngredients: {
              ...preWorkoutFields.pumpIngredients,
              citrulline: Number(e.target.value)
            }
          })}
          placeholder="6"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Beta-Alanine (g/serving)</label>
        <Input
          type="number"
          step="0.1"
          value={preWorkoutFields.pumpIngredients?.betaAlanine || ''}
          onChange={(e) => updatePreWorkoutFields({
            pumpIngredients: {
              ...preWorkoutFields.pumpIngredients,
              betaAlanine: Number(e.target.value)
            }
          })}
          placeholder="3.2"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">L-Arginine (g/serving)</label>
        <Input
          type="number"
          step="0.1"
          value={preWorkoutFields.pumpIngredients?.arginine || ''}
          onChange={(e) => updatePreWorkoutFields({
            pumpIngredients: {
              ...preWorkoutFields.pumpIngredients,
              arginine: Number(e.target.value)
            }
          })}
          placeholder="2"
          className="text-base border-none shadow-none px-0 py-1 h-auto focus:ring-0 focus:border-transparent hover:bg-gray-50 focus:bg-white transition-colors"
        />
      </div>
    </div>
  );
}

export function HydrationFieldsComponent({ product, isEditing, onChange }: CategoryFieldsProps) {
  const hydrationFields = product.hydrationFields || {} as HydrationFields;

  const updateHydrationFields = (updates: Partial<HydrationFields>) => {
    onChange({
      hydrationFields: { ...hydrationFields, ...updates }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          💧 Hydration Specifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Sodium (mg/serving)</label>
            {isEditing ? (
              <Input
                type="number"
                value={hydrationFields.electrolyteProfile?.sodium || ''}
                onChange={(e) => updateHydrationFields({
                  electrolyteProfile: {
                    ...hydrationFields.electrolyteProfile,
                    sodium: Number(e.target.value),
                    potassium: hydrationFields.electrolyteProfile?.potassium || 0,
                    magnesium: hydrationFields.electrolyteProfile?.magnesium || 0
                  }
                })}
                placeholder="230"
              />
            ) : (
              <div className="text-sm font-semibold">{hydrationFields.electrolyteProfile?.sodium || 'Not set'}mg</div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Potassium (mg/serving)</label>
            {isEditing ? (
              <Input
                type="number"
                value={hydrationFields.electrolyteProfile?.potassium || ''}
                onChange={(e) => updateHydrationFields({
                  electrolyteProfile: {
                    ...hydrationFields.electrolyteProfile,
                    sodium: hydrationFields.electrolyteProfile?.sodium || 0,
                    potassium: Number(e.target.value),
                    magnesium: hydrationFields.electrolyteProfile?.magnesium || 0
                  }
                })}
                placeholder="99"
              />
            ) : (
              <div className="text-sm">{hydrationFields.electrolyteProfile?.potassium || 'Not set'}mg</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Magnesium (mg/serving)</label>
            {isEditing ? (
              <Input
                type="number"
                value={hydrationFields.electrolyteProfile?.magnesium || ''}
                onChange={(e) => updateHydrationFields({
                  electrolyteProfile: {
                    ...hydrationFields.electrolyteProfile,
                    sodium: hydrationFields.electrolyteProfile?.sodium || 0,
                    potassium: hydrationFields.electrolyteProfile?.potassium || 0,
                    magnesium: Number(e.target.value)
                  }
                })}
                placeholder="60"
              />
            ) : (
              <div className="text-sm">{hydrationFields.electrolyteProfile?.magnesium || 'Not set'}mg</div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Sugar Content (g)</label>
            {isEditing ? (
              <Input
                type="number"
                value={hydrationFields.sugarContent || ''}
                onChange={(e) => updateHydrationFields({ sugarContent: Number(e.target.value) })}
                placeholder="0"
              />
            ) : (
              <div className="text-sm">{hydrationFields.sugarContent || 'Not set'}g</div>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Hydration Ratio</label>
          {isEditing ? (
            <Input
              value={hydrationFields.hydrationRatio || ''}
              onChange={(e) => updateHydrationFields({ hydrationRatio: e.target.value })}
              placeholder="1 scoop per 16oz water"
            />
          ) : (
            <div className="text-sm">{hydrationFields.hydrationRatio || 'Not set'}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CreatineFieldsComponent({ product, isEditing, onChange }: CategoryFieldsProps) {
  const creatineFields = product.creatineFields || {} as CreatineFields;

  const updateCreatineFields = (updates: Partial<CreatineFields>) => {
    onChange({
      creatineFields: { ...creatineFields, ...updates }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          💪 Creatine Specifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Creatine Content (g/serving)</label>
            {isEditing ? (
              <Input
                type="number"
                step="0.1"
                value={creatineFields.creatineContent || ''}
                onChange={(e) => updateCreatineFields({ creatineContent: Number(e.target.value) })}
                placeholder="5"
              />
            ) : (
              <div className="text-sm font-semibold">{creatineFields.creatineContent || 'Not set'}g</div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Creatine Type</label>
            {isEditing ? (
              <Select
                value={creatineFields.creatineType || 'monohydrate'}
                onValueChange={(value) => updateCreatineFields({ creatineType: value as any })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monohydrate">Monohydrate</SelectItem>
                  <SelectItem value="hcl">HCl (Hydrochloride)</SelectItem>
                  <SelectItem value="buffered">Buffered</SelectItem>
                  <SelectItem value="blend">Blend</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm capitalize">{creatineFields.creatineType || 'Not set'}</div>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Purity (%)</label>
          {isEditing ? (
            <Input
              type="number"
              min="80"
              max="100"
              value={creatineFields.purity || ''}
              onChange={(e) => updateCreatineFields({ purity: Number(e.target.value) })}
              placeholder="99.9"
            />
          ) : (
            <div className="text-sm">{creatineFields.purity || 'Not set'}%</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Loading Phase (g/day)</label>
            {isEditing ? (
              <Input
                type="number"
                value={creatineFields.loadingPhase?.dosage || ''}
                onChange={(e) => updateCreatineFields({
                  loadingPhase: {
                    ...creatineFields.loadingPhase,
                    dosage: Number(e.target.value),
                    duration: creatineFields.loadingPhase?.duration || 5
                  }
                })}
                placeholder="20"
              />
            ) : (
              <div className="text-sm">{creatineFields.loadingPhase?.dosage || 'Not set'}g/day</div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Maintenance (g/day)</label>
            {isEditing ? (
              <Input
                type="number"
                value={creatineFields.maintenancePhase?.dosage || ''}
                onChange={(e) => updateCreatineFields({
                  maintenancePhase: {
                    dosage: Number(e.target.value)
                  }
                })}
                placeholder="5"
              />
            ) : (
              <div className="text-sm">{creatineFields.maintenancePhase?.dosage || 'Not set'}g/day</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Main component that renders category-specific fields
export function CategorySpecificFields({ product, isEditing, onChange }: CategoryFieldsProps) {
  switch (product.category) {
    case 'protein':
      return <ProteinFieldsComponent product={product} isEditing={isEditing} onChange={onChange} />;
    case 'pre-workout':
      return <PreWorkoutFieldsComponent product={product} isEditing={isEditing} onChange={onChange} />;
    case 'hydration':
      return <HydrationFieldsComponent product={product} isEditing={isEditing} onChange={onChange} />;
    case 'creatine':
      return <CreatineFieldsComponent product={product} isEditing={isEditing} onChange={onChange} />;
    default:
      return (
        <Card>
          <CardHeader>
            <CardTitle>General Supplement</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Select a specific supplement category to see specialized fields.
            </p>
          </CardContent>
        </Card>
      );
  }
}
