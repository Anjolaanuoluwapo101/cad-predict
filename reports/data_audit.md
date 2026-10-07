# Data audit

## 1.1 Shape, missing, duplicates

```
shape=(303, 59)
missing cells=0
duplicate rows=0
```

## 1.2 Text columns

```
Sex: {'Male': 176, 'Fmale': 127}
Obesity: {'Y': 211, 'N': 92}
CRF: {'N': 297, 'Y': 6}
CVA: {'N': 298, 'Y': 5}
Airway disease: {'N': 292, 'Y': 11}
Thyroid Disease: {'N': 296, 'Y': 7}
CHF: {'N': 302, 'Y': 1}
DLP: {'N': 191, 'Y': 112}
Weak Peripheral Pulse: {'N': 298, 'Y': 5}
Lung rales: {'N': 292, 'Y': 11}
Systolic Murmur: {'N': 262, 'Y': 41}
Diastolic Murmur: {'N': 294, 'Y': 9}
Dyspnea: {'N': 169, 'Y': 134}
Atypical: {'N': 210, 'Y': 93}
Nonanginal: {'N': 287, 'Y': 16}
Exertional CP: {'N': 303}
LowTH Ang: {'N': 301, 'Y': 2}
LVH: {'N': 283, 'Y': 20}
Poor R Progression: {'N': 294, 'Y': 9}
BBB: {'N': 282, 'LBBB': 13, 'RBBB': 8}
VHD: {'mild': 149, 'N': 116, 'Moderate': 27, 'Severe': 11}
LAD: {'Stenotic': 177, 'Normal': 126}
LCX: {'Normal': 184, 'Stenotic': 119}
RCA: {'Normal': 189, 'Stenotic': 114}
Cath: {'CAD': 216, 'Normal': 87}
```

## 1.3 Class balance (positive, negative)

```
CAD: (216, 87)
LAD: (177, 126)
LCX: (119, 184)
RCA: (114, 189)
```

## 1.4 Rows where Cath disagrees with vessel labels (Excel row numbers)

```
[95]
(+2: pandas starts at 0, Excel header is row 1)
```

## 1.5 Constant columns after encoding + rarest binary columns (count of 1s)

```
constant: ['Exertional CP']
features before dropping constants: 56
CHF                       1
LowTH Ang                 2
Weak Peripheral Pulse     5
CVA                       5
CRF                       6
Thyroid Disease           7
BBB_RBBB                  8
Poor R Progression        9
Diastolic Murmur          9
EX-Smoker                10
```

## 1.6 Redundancy

```
max |BMI - Weight/Height^2| = 0.000
Obesity vs BMI>=25:
BMI      False  True 
Obesity              
N           92      0
Y            1    210
corr(Lymph, Neut) = -0.92
```

## 1.7 describe()

```
                        min     mean      max
Age                   30.00    58.90     86.0
Weight                48.00    73.83    120.0
Length               140.00   164.72    188.0
BMI                   18.12    27.25     40.9
DM                     0.00     0.30      1.0
HTN                    0.00     0.59      1.0
Current Smoker         0.00     0.21      1.0
EX-Smoker              0.00     0.03      1.0
FH                     0.00     0.16      1.0
BP                    90.00   129.55    190.0
PR                    50.00    75.14    110.0
Edema                  0.00     0.04      1.0
Typical Chest Pain     0.00     0.54      1.0
Function Class         0.00     0.66      3.0
Q Wave                 0.00     0.05      1.0
St Elevation           0.00     0.05      1.0
St Depression          0.00     0.23      1.0
Tinversion             0.00     0.30      1.0
FBS                   62.00   119.18    400.0
CR                     0.50     1.06      2.2
TG                    37.00   150.34   1050.0
LDL                   18.00   104.64    232.0
HDL                   15.90    40.23    111.0
BUN                    6.00    17.50     52.0
ESR                    1.00    19.46     90.0
HB                     8.90    13.15     17.6
K                      3.00     4.23      6.6
Na                   128.00   141.00    156.0
WBC                 3700.00  7562.05  18000.0
Lymph                  7.00    32.40     60.0
Neut                  32.00    60.15     89.0
PLT                   25.00   221.49    742.0
EF-TTE                15.00    47.23     60.0
Region RWMA            0.00     0.62      4.0
```
